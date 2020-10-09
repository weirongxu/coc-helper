import { commands, Disposable, ExtensionContext } from 'coc.nvim';
import { helperAsyncCatch } from '.';
import { utilModule } from './modules/util';
import { genOnError, helperOnError, versionName } from './util';
import { VimModule } from './VimModule';

type Arguments<F extends Function> = F extends (...args: infer Args) => any
  ? Args
  : never;

namespace HelperEventEmitter {
  export type EventResult = void | Promise<void>;
  export type EventListener = (...args: any[]) => EventResult;
  export type BufEventListener = (bufnr: number) => EventResult;
  export interface VimEventOptions {
    eventExpr: string;
    argExprs?: string[];
    /**
     * @default
     */
    async?: boolean;
  }
}

export class HelperEventEmitter<
  Events extends Record<string, HelperEventEmitter.EventListener>
> {
  listenersMap = new Map<keyof Events, HelperEventEmitter.EventListener[]>();

  constructor(
    protected onError: ReturnType<typeof genOnError>,
    public readonly concurrent = false,
  ) {}

  listeners(event: keyof Events): HelperEventEmitter.EventListener[] {
    if (!this.listenersMap.has(event)) {
      const listeners: HelperEventEmitter.EventListener[] = [];
      this.listenersMap.set(event, listeners);
      return listeners;
    }
    return this.listenersMap.get(event)!;
  }

  on<E extends keyof Events>(
    event: E,
    listener: Events[E],
    disposables?: Disposable[],
  ) {
    this.listeners(event as string).push(listener);
    const disposable = Disposable.create(() => this.off(event, listener));
    if (disposables) {
      disposables.push(disposable);
    }
    return disposable;
  }

  off<E extends keyof Events>(event: E, listener: Events[E]) {
    // @ts-ignore
    if (typeof listener.cancel === 'function') {
      // @ts-ignore
      listener.cancel();
    }
    const listeners = this.listeners(event as string);
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }

  async fire<E extends keyof Events>(event: E, ...args: Arguments<Events[E]>) {
    if (this.concurrent) {
      await Promise.all(
        this.listeners(event as string).map(async (listener) => {
          try {
            await listener(...args);
          } catch (e) {
            this.onError(e);
          }
        }),
      );
    } else {
      for (const listener of this.listeners(event as string)) {
        try {
          await listener(...args);
        } catch (e) {
          this.onError(e);
        }
      }
    }
  }
}

export class HelperVimEvents<
  VimEvents extends Record<string, HelperEventEmitter.EventListener>
> {
  static ID = 0;

  public events: HelperEventEmitter<VimEvents>;
  public augroupName: string;
  public commandName: string;
  public id: number;

  constructor(
    protected vimEvents: Record<
      keyof VimEvents,
      HelperEventEmitter.VimEventOptions
    >,
    protected onError: ReturnType<typeof genOnError>,
    protected options: {
      name?: string;
      augroupName?: string;
      commandName?: string;
      /**
       * @default false
       */
      concurrent?: boolean;
    } = {},
  ) {
    ++HelperVimEvents.ID;
    this.id = HelperVimEvents.ID;
    this.augroupName =
      options.augroupName ??
      `CocHelperInternal_${versionName}_${
        options.name ? `${options.name}_` : ''
      }${this.id}`;
    this.commandName =
      options.commandName ??
      options.commandName ??
      `coc-helper.internal.didVimEvent_${
        options.name ? `${options.name}_` : ''
      }${this.id}`;
    this.events = new HelperEventEmitter(onError, options.concurrent ?? false);
  }

  async register(context: ExtensionContext) {
    await eventsModule.activate.call(
      this.augroupName,
      this.commandName,
      Object.entries(this.vimEvents).map(([key, e]) => ({
        event: key,
        ...e,
      })),
    );

    context.subscriptions.push(
      Disposable.create(async () => {
        await eventsModule.deactivate.call(this.augroupName);
      }),
    );

    context.subscriptions.push(
      commands.registerCommand(
        this.commandName,
        helperAsyncCatch((event: any, ...args: any[]) =>
          this.events.fire(event, ...(args as any)),
        ),
        undefined,
        true,
      ),
    );
  }
}

export const helperVimEvents = new HelperVimEvents<{
  BufDelete: HelperEventEmitter.BufEventListener;
  BufWipeout: HelperEventEmitter.BufEventListener;
}>(
  {
    BufDelete: {
      eventExpr: 'BufDelete *',
      argExprs: ["+expand('<abuf>')"],
    },
    BufWipeout: {
      eventExpr: 'BufWipeout *',
      argExprs: ["+expand('<abuf>')"],
    },
  },
  helperOnError,
);

export const helperEvents = helperVimEvents.events;

export namespace eventsModule {
  export interface ActivateEvent extends HelperEventEmitter.VimEventOptions {
    event: string;
  }
}

export const eventsModule = VimModule.create('events', (m) => {
  const activate = m.fn<[augroupName: string, autocmdEvents: string[]], void>(
    'activate',
    ({ name }) => `
      function! ${name}(augroup_name, autocmd_events) abort
        execute 'augroup ' . a:augroup_name
          autocmd!
          for autocmd_event in a:autocmd_events
            execute autocmd_event
          endfor
        augroup END
      endfunction
    `,
  );

  function getActivateEvents(
    commandName: string,
    activateEvents: eventsModule.ActivateEvent[],
  ) {
    return activateEvents.map((e) => {
      const args = `${[
        `'${commandName}'`,
        `'${e.event}'`,
        ...(e.argExprs ?? []),
      ].join(', ')}`;
      return `autocmd ${e.eventExpr} call ${
        e.async === false
          ? utilModule.runCocCmd.inlineCall(args)
          : utilModule.runCocCmdAsync.inlineCall(args)
      }`;
    });
  }
  return {
    activate: {
      call: (
        augroupName: string,
        commandName: string,
        activateEvents: eventsModule.ActivateEvent[],
      ) =>
        activate.call(
          augroupName,
          getActivateEvents(commandName, activateEvents),
        ),
      callNotify: (
        augroupName: string,
        commandName: string,
        activateEvents: eventsModule.ActivateEvent[],
      ) =>
        activate.callNotify(
          augroupName,
          getActivateEvents(commandName, activateEvents),
        ),
      callNotifier: (
        augroupName: string,
        commandName: string,
        activateEvents: eventsModule.ActivateEvent[],
      ) =>
        activate.callNotifier(
          augroupName,
          getActivateEvents(commandName, activateEvents),
        ),
    },
    deactivate: m.fn<[augroupName: string], void>(
      'deactivate',
      ({ name }) => `
        function! ${name}(augroup_name) abort
          execute 'augroup ' . a:augroup_name
            autocmd!
          augroup END
        endfunction
      `,
    ),
    doAutocmd: m.fn<[name: string], void>(
      'do_autocmd',
      ({ name }) => `
        function! ${name}(name) abort
          if exists('#User#'.a:name)
            exe 'doautocmd <nomodeline> User '.a:name
          endif
        endfunction
      `,
    ),
  };
});
