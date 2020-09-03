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

const augroupName = `CocHelperInternal_${versionName}`;

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
  QuitPre: () => EventResult;
}>(helperOnError);

export async function registerInternalEvents(context: ExtensionContext) {
  const cmdName = 'coc-helper.internal.didVimEvent';
  await eventsModule.activate.call([
    {
      cmdName,
      eventExpr: 'BufDelete *',
      argExprs: ['BufDelete', '+expand("<abuf>")'],
    },
    {
      cmdName,
      eventExpr: 'BufWipeout *',
      argExprs: ['BufWipeout', '+expand("<abuf>")'],
    },
    {
      cmdName,
      eventExpr: 'QuitPre',
      argExprs: ['QuitPre'],
    },
  ]);
  context.subscriptions.push(
    Disposable.create(async () => {
      await eventsModule.deactivate.call();
    }),
  );

  context.subscriptions.push(
    commands.registerCommand(
      'coc-helper.internal.didVimEvent',
      helperAsyncCatch((event: any, ...args: any[]) =>
        helperEvents.fire(event, ...args),
      ),
      undefined,
      true,
    ),
  );
}

export namespace eventsModule {
  export type ActivateEvent = {
    /**
     * command name
     */
    cmdName: string;
    eventExpr: string;
    argExprs?: string[];
  };
}

export const eventsModule = VimModule.create('events', (m) => {
  const activate = m.fn<[activateEvents: string], void>(
    'activate',
    ({ name }) => `
      function! ${name}(activate_events) abort
        augroup ${augroupName}
          autocmd!
          execute a:activate_events
        augroup END
      endfunction
    `,
  );

  function getActivateEvents(activateEvents: eventsModule.ActivateEvent[]) {
    return activateEvents
      .map(
        (e) =>
          `autocmd ${e.eventExpr} call ${utilModule.runCocCmdAsync.name}(${[
            `'${e.cmdName}'`,
            ...(e.argExprs ?? []),
          ].join(',')})`,
      )
      .join('\n');
  }
  return {
    activate: {
      call: (activateEvents: eventsModule.ActivateEvent[]) =>
        activate.call(getActivateEvents(activateEvents)),
      callNotify: (activateEvents: eventsModule.ActivateEvent[]) =>
        activate.callNotify(getActivateEvents(activateEvents)),
      callNotifier: (activateEvents: eventsModule.ActivateEvent[]) =>
        activate.callNotifier(getActivateEvents(activateEvents)),
    },
    deactivate: m.fn<[], void>(
      'deactivate',
      ({ name }) => `
        function! ${name}() abort
          augroup ${augroupName}
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
