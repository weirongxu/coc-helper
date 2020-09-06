import { workspace, OutputChannel, MapMode } from 'coc.nvim';
import util from 'util';
import Pkg from '../package.json';

export const version = Pkg.version;

export const versionName = version.replace(/[.-]/g, '_');

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

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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

export function sum(arr: number[]) {
  return arr.reduce((total, cur) => total + cur);
}

export function byteIndex(content: string, index: number): number {
  const s = content.slice(0, index);
  return Buffer.byteLength(s);
}

export function byteLength(str: string): number {
  return Buffer.byteLength(str);
}

export async function displayHeight(
  width: number,
  lines: string[],
  /**
   * line is 1-index, column is 0-index
   */
  cursor?: [line: number, column: number],
  mode: MapMode = 'n',
) {
  const heightGroup = await Promise.all(
    lines.map(async (l, idx) => {
      let strwidth: number = await workspace.nvim.call('strdisplaywidth', [l]);
      if (
        mode === 'i' &&
        cursor &&
        cursor[0] - 1 === idx &&
        cursor[1] + 1 >= strwidth
      ) {
        strwidth += 1;
      }
      return Math.ceil(strwidth / width);
    }),
  );
  return sum(heightGroup);
}
