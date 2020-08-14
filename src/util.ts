import { workspace, OutputChannel } from 'coc.nvim';

export const outputChannel = workspace.createOutputChannel('coc-helper');

export function genOnError(outputChannel: OutputChannel) {
  return (error: Error | string) => {
    if (error instanceof Error) {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(error.message, 'error');
      outputChannel.appendLine(error.stack ?? error.toString());
    } else {
      // eslint-disable-next-line no-restricted-properties
      workspace.showMessage(error, 'error');
      outputChannel.appendLine(error);
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

export const compactI = <T>(arr: (T | undefined | null | void)[]): T[] =>
  arr.filter((it): it is T => it !== undefined && it !== null);
