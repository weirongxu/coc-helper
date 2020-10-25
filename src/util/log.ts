import { OutputChannel, workspace } from 'coc.nvim';
import util from 'util';
import { isTest } from './env';

export const outputChannel = workspace.createOutputChannel('coc-helper');

export function genOnError(outputChannel: OutputChannel) {
  return (error: Error | string) => {
    if (error instanceof Error) {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(error.message, 'error');
      outputChannel.appendLine(error.stack ?? error.toString());
      if (isTest) {
        // eslint-disable-next-line no-console
        console.error(error.stack ?? error.toString());
      }
    } else {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(error, 'error');
      outputChannel.appendLine(error);
      if (isTest) {
        // eslint-disable-next-line no-console
        console.error(error);
      }
    }
  };
}

export const helperOnError = genOnError(outputChannel);

type AsyncCatchFn = (...args: any) => any | Promise<any>;

export function genAsyncCatch(
  catchError: (error: Error) => any,
): (fn: AsyncCatchFn) => AsyncCatchFn {
  return (fn) => {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        catchError(e);
      }
    };
  };
}

export const helperAsyncCatch = genAsyncCatch(helperOnError);

export function prettyPrint(...data: any[]) {
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
  // eslint-disable-next-line no-restricted-properties
  workspace.showMessage(s);
}