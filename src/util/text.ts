import { MapMode, workspace } from 'coc.nvim';
import { sum } from './collection';
import { isWindows } from './env';

export function generateUri(path: string, scheme = 'file') {
  if (scheme === 'file' && isWindows && /^[A-Za-z]:/.test(path)) {
    path = `/${path}`;
  }
  return `${scheme}://${path}`;
}

export function byteIndex(content: string, index: number): number {
  const s = content.slice(0, index);
  return Buffer.byteLength(s);
}

export function byteLength(str: string): number {
  return Buffer.byteLength(str);
}

export async function displayWidth(content: string) {
  return (await workspace.nvim.call('strdisplaywidth', [content])) as number;
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
      let strwidth = await displayWidth(l);
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
