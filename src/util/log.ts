import { OutputChannel, window, Disposable } from 'coc.nvim';
import util from 'util';
import { isTest } from './env';

type AsyncCatchFn = (...args: any) => any | Promise<any>;

export class HelperLogger implements Disposable {
  private outputChannel_?: OutputChannel;
  constructor(public readonly channelName: string) {
    this.appendLine = this.appendLine.bind(this);
    this.error = this.error.bind(this);
  }

  dispose() {
    this.outputChannel_?.dispose();
  }

  get outputChannel() {
    if (!this.outputChannel_) {
      this.outputChannel_ = window.createOutputChannel(this.channelName);
    }
    return this.outputChannel_;
  }

  appendLine(line: string) {
    this.outputChannel.appendLine(line);
  }

  error(error: Error | string) {
    if (error instanceof Error) {
      // eslint-disable-next-line no-restricted-properties
      window.showMessage(error.message, 'error');
      this.outputChannel?.appendLine(error.stack ?? error.toString());
      if (isTest) {
        // eslint-disable-next-line no-console
        console.error(error.stack ?? error.toString());
      }
    } else {
      // eslint-disable-next-line no-restricted-properties
      window.showMessage(error, 'error');
      this.outputChannel?.appendLine(error);
      if (isTest) {
        // eslint-disable-next-line no-console
        console.error(error);
      }
    }
  }

  /**
   * Wrap the async function and catch the error
   */
  asyncCatch(fn: AsyncCatchFn): AsyncCatchFn {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        this.error(e);
      }
    };
  }
}

export const helperLogger = new HelperLogger('coc-helper');

export function prettyObject(...data: any[]): string {
  const padZore = (s: number) => s.toString(10).padStart(2, '0');
  const date = new Date();
  let s = `[${date.getFullYear()}/${padZore(date.getMonth() + 1)}/${padZore(
    date.getDate(),
  )} ${padZore(date.getHours())}:${padZore(date.getMinutes())}:${padZore(
    date.getSeconds(),
  )}.${padZore(date.getMilliseconds())}]`;
  for (const d of data) {
    s += ' ' + util.inspect(d);
  }
  return s;
}

export function prettyPrint(...data: any[]) {
  helperLogger.appendLine(prettyObject(...data));
  // eslint-disable-next-line no-restricted-properties
  window.showMessage(prettyObject(...data));
}
