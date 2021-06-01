import { workspace } from 'coc.nvim';
import { compactI } from './util';

export namespace Notifier {
  export type Cell = Notifier | void | undefined | null;
}

export class Notifier {
  static async run(notifier: Notifier.Cell | Promise<Notifier.Cell>) {
    if (!notifier) {
      return;
    }
    if ('then' in notifier) {
      const awaitedNotifier = await notifier;
      if (awaitedNotifier) {
        return awaitedNotifier.run();
      }
    } else {
      return notifier.run();
    }
  }

  static notifyAll(lazyNotifies: Notifier.Cell[]) {
    for (const n of lazyNotifies) {
      if (n) {
        n.notify();
      }
    }
  }

  static async runAll(
    notifierPromises: (Notifier.Cell | Promise<Notifier.Cell>)[],
  ) {
    const notifiers = await Promise.all(notifierPromises);
    workspace.nvim.pauseNotification();
    this.notifyAll(notifiers);
    return workspace.nvim.resumeNotification() as Promise<unknown>;
  }

  static combine(notifiers: Notifier.Cell[]) {
    const compactedNotifiers = compactI(notifiers);
    if (compactedNotifiers.length < 1) {
      return Notifier.noop();
    }
    if (compactedNotifiers.length === 1) {
      return compactedNotifiers[0];
    }
    return compactedNotifiers.reduce(
      (ret, cur) => ret.concat(cur),
      Notifier.noop(),
    );
  }

  static noop() {
    return this.create(() => {});
  }

  static create(notify: () => void) {
    return new Notifier(notify);
  }

  protected notifyFns: (() => void)[] = [];

  protected constructor(notify: () => void) {
    this.notifyFns.push(notify);
  }

  async run() {
    return Notifier.runAll([this]);
  }

  notify() {
    for (const fn of this.notifyFns) {
      fn();
    }
  }

  concat(notifier: Notifier) {
    this.notifyFns.push(...notifier.notifyFns);
    return this;
  }
}
