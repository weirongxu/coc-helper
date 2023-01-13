import { Disposable } from 'coc.nvim';
import type { HelperLogger } from './util';

type Arguments<F extends () => any> = F extends (...args: infer Args) => any
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

export class HelperEventEmitter<Events extends Record<string, any>> {
  listenersMap = new Map<keyof Events, HelperEventEmitter.EventListener[]>();

  constructor(
    protected helperLogger: HelperLogger,
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

  once<E extends keyof Events>(
    event: E,
    listener: Events[E],
    disposables?: Disposable[],
  ) {
    this.listeners(event as string).push(async (...args) => {
      const result = await listener(...args);
      disposable.dispose();
      return result;
    });
    const disposable = Disposable.create(() => this.off(event, listener));
    if (disposables) {
      disposables.push(disposable);
    }
    return disposable;
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
            this.helperLogger.error(e);
          }
        }),
      );
    } else {
      for (const listener of this.listeners(event as string)) {
        try {
          await listener(...args);
        } catch (e) {
          this.helperLogger.error(e);
        }
      }
    }
  }
}
