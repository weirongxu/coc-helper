import { commands, Disposable, ExtensionContext } from 'coc.nvim';
import { helperAsyncCatch } from '.';
import { utilModule } from './modules/util';
import { genOnError, helperOnError, versionName } from './util';
import { VimModule } from './VimModule';

type Arguments<F extends Function> = F extends (...args: infer Args) => any
  ? Args
  : never;
type EventResult = void | Promise<void>;
type EventListener = (...args: any[]) => EventResult;
type BufEventListener = (bufnr: number) => EventResult;

export class VimEventEmitter<Events extends Record<string, EventListener>> {
  listenersMap = new Map<keyof Events, EventListener[]>();

  constructor(
    protected onError: ReturnType<typeof genOnError>,
    public readonly concurrent = false,
  ) {}

  listeners(event: keyof Events): EventListener[] {
    if (!this.listenersMap.has(event)) {
      const listeners: EventListener[] = [];
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

export const helperEvents = new VimEventEmitter<{
  BufDelete: BufEventListener;
  BufWipeout: BufEventListener;
}>(helperOnError);

export async function registerHelperEvents(context: ExtensionContext) {
  await registerVimEvents(
    context,
    helperEvents,
    [
      {
        event: 'BufDelete',
        eventExpr: 'BufDelete *',
        argExprs: ["+expand('<abuf>')"],
      },
      {
        event: 'BufWipeout',
        eventExpr: 'BufWipeout *',
        argExprs: ["+expand('<abuf>')"],
      },
    ],
    `CocHelperInternal_${versionName}`,
    'coc-helper.internal.didVimEvent',
  );
}

export async function registerVimEvents(
  context: ExtensionContext,
  events: VimEventEmitter<any>,
  activateEvents: eventsModule.ActivateEvent[],
  augroupName: string,
  commandName: string,
) {
  await eventsModule.activate.call(augroupName, commandName, activateEvents);

  context.subscriptions.push(
    Disposable.create(async () => {
      await eventsModule.deactivate.call(augroupName);
    }),
  );

  context.subscriptions.push(
    commands.registerCommand(
      commandName,
      helperAsyncCatch((event: any, ...args: any[]) =>
        events.fire(event, ...args),
      ),
      undefined,
      true,
    ),
  );
}

export namespace eventsModule {
  export type ActivateEvent = {
    event: string;
    eventExpr: string;
    argExprs?: string[];
    /**
     * @default
     */
    async?: boolean;
  };
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
