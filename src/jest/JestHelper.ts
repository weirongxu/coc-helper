/*---------------------------------------------------------------------------------------------
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *
 * 2018-2020 Qiming Zhao <chemzqm@gmail.com>
 * 2020 Weirong Xu <weirongxu.raidou@gmail.com>
 *--------------------------------------------------------------------------------------------*/
/**
 * modified from: https://github.com/neoclide/coc.nvim/blob/5cf5117b9fbbd32d4e4bab2116c36685fee0d881/src/__tests__/helper.ts
 */

import { Neovim, Window } from '@chemzqm/neovim';
import * as cp from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import util from 'util';
import { v4 as uuid } from 'uuid';
// @ts-ignore
import attach from 'coc.nvim/attach';
// @ts-ignore
import { terminate } from 'coc.nvim/util/processes';
// @ts-ignore
import completion from 'coc.nvim/completion';
// @ts-ignore
import workspace from 'coc.nvim/workspace';
// @ts-ignore
import Plugin from 'coc.nvim/plugin';
import {
  Buffer,
  events,
  VimCompleteItem,
  Document,
  OutputChannel,
} from 'coc.nvim';

// @ts-ignore
global.__TEST__ = true;

const nullChannel: OutputChannel = {
  content: '',
  show: () => {},
  dispose: () => {},
  name: 'null',
  append: () => {},
  appendLine: () => {},
  clear: () => {},
  hide: () => {},
};

process.on('uncaughtException', (err) => {
  const msg = `Uncaught exception: ${err.stack}`;
  // eslint-disable-next-line no-console
  console.error(msg);
});

export class JestHelper extends EventEmitter {
  private _nvim?: Neovim;
  private _plugin?: Plugin;

  public proc?: cp.ChildProcess | null;

  constructor(public testsDir: string) {
    super();
    this.setMaxListeners(99);
  }

  public set nvim(_nvim: Neovim) {
    this._nvim = _nvim;
  }

  public get nvim() {
    if (!this._nvim) {
      throw new Error('require to execute jestHelper.setup() in beforeAll()');
    }
    return this._nvim;
  }

  public set plugin(_plugin: Plugin) {
    this._plugin = _plugin;
  }

  public get plugin() {
    if (!this._plugin) {
      throw new Error('require to execute jestHelper.setup() in beforeAll()');
    }
    return this._plugin;
  }

  public boot() {
    beforeAll(async () => {
      try {
        await this.setup();
      } catch (e) {
        console.error(e);
      }
    });

    afterAll(async () => {
      await this.shutdown();
    });

    afterEach(async () => {
      await this.reset();
    });
  }

  public setupNvim(): void {
    const vimrc = path.resolve(__dirname, 'vimrc');
    const proc = (this.proc = cp.spawn(
      process.env.COC_TEST_NVIM ?? 'nvim',
      ['-u', vimrc, '-i', 'NONE', '--embed'],
      {
        cwd: __dirname,
        env: {
          EXTENSION_ROOT_PATH: process.cwd(),
        },
      },
    ));
    const plugin = attach({ proc });
    this.nvim = plugin.nvim;
  }

  public async setup(): Promise<void> {
    const vimrcPath = path.join(this.testsDir, 'vimrc');
    const proc = (this.proc = cp.spawn(
      'nvim',
      ['-u', vimrcPath, '-i', 'NONE', '--embed'],
      {
        cwd: this.testsDir,
        env: {
          EXTENSION_ROOT_PATH: process.cwd(),
        },
      },
    ));
    const plugin = (this.plugin = attach({ proc }));
    this.nvim = plugin.nvim as unknown as Neovim;
    this.nvim.uiAttach(160, 80, {}).catch((e) => {
      console.error(e);
    });
    proc.on('exit', () => {
      this.proc = undefined;
    });
    this.nvim.on('notification', (method, args) => {
      if (method === 'redraw') {
        for (const arg of args) {
          const event = arg[0];
          this.emit(event, arg.slice(1));
          if (event == 'put') {
            const arr = arg.slice(1).map((o) => o[0]);
            const line = arr.join('').trim();
            if (line.length > 3) {
              // console.log(line)
            }
          }
        }
      }
    });
    return new Promise((resolve) => {
      plugin.once('ready', resolve);
    });
  }

  public async shutdown(): Promise<void> {
    if (this.plugin) this.plugin.dispose();
    this.nvim.removeAllListeners();
    this._nvim = undefined;
    if (this.proc) {
      this.proc.unref();
      terminate(this.proc);
      this.proc = null;
    }
    await this.wait(60);
  }

  public async triggerCompletion(source: string): Promise<void> {
    await this.nvim.call('coc#start', { source });
  }

  public async waitPopup(): Promise<void> {
    const visible = await this.nvim.call('pumvisible');
    if (visible) return;
    // @ts-ignore
    const res = await events.race(['MenuPopupChanged'], 2000);
    if (!res) throw new Error('wait pum timeout after 2s');
  }

  public async waitPreviewWindow(): Promise<void> {
    for (let i = 0; i < 40; i++) {
      await this.wait(50);
      const has = await this.nvim.call('coc#list#has_preview');
      if (has > 0) return;
    }
    throw new Error('timeout after 2s');
  }

  public async waitFloat(): Promise<number> {
    for (let i = 0; i < 50; i++) {
      await this.wait(20);
      const winid = await this.nvim.call('GetFloatWin');
      if (winid) return winid;
    }
    throw new Error('timeout after 2s');
  }

  public async selectCompleteItem(idx: number): Promise<void> {
    await this.nvim.call('nvim_select_popupmenu_item', [idx, true, true, {}]);
  }

  public async doAction(method: string, ...args: any[]): Promise<any> {
    return await this.plugin.cocAction(method, ...args);
  }

  public async synchronize(): Promise<void> {
    const doc = await workspace.document;
    doc.forceSync();
  }

  public async reset(): Promise<void> {
    const mode = await this.nvim.mode;
    if (mode.blocking && mode.mode == 'r') {
      await this.nvim.input('<cr>');
    } else if (mode.mode != 'n' || mode.blocking) {
      await this.nvim.call('feedkeys', [String.fromCharCode(27), 'in']);
    }
    completion.stop();
    workspace.reset();
    await this.nvim.command('silent! %bwipeout!');
    await this.nvim.command('setl nopreviewwindow');
    await this.wait(30);
    await workspace.document;
  }

  public async pumvisible(): Promise<boolean> {
    const res = (await this.nvim.call('pumvisible', [])) as number;
    return res === 1;
  }

  public wait(ms = 30): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }

  public async visible(word: string, source?: string): Promise<boolean> {
    await this.waitPopup();
    const context = (await this.nvim.getVar('coc#_context')) as any;
    const items = context.candidates;
    if (!items) return false;
    const item = items.find((o) => o.word == word);
    if (!item || !item.user_data) return false;
    try {
      const arr = item.user_data.split(':', 2);
      if (source && arr[0] !== source) {
        return false;
      }
    } catch (e) {
      return false;
    }
    return true;
  }

  public async notVisible(word: string): Promise<boolean> {
    const items = await this.getItems();
    return items.findIndex((o) => o.word === word) === -1;
  }

  public async getItems(): Promise<VimCompleteItem[]> {
    const visible = await this.pumvisible();
    if (!visible) {
      return [];
    }
    const context = (await this.nvim.getVar('coc#_context')) as any;
    const items = context.candidates;
    return items || [];
  }

  public async edit(file?: string): Promise<Buffer> {
    if (!file || !path.isAbsolute(file)) {
      file = path.join(__dirname, file ? file : `${uuid()}`);
    }
    const escaped = (await this.nvim.call('fnameescape', file)) as string;
    await this.nvim.command(`edit ${escaped}`);
    const doc = await workspace.document;
    return doc.buffer;
  }

  public async createDocument(name?: string): Promise<Document> {
    const buf = await this.edit(name);
    const doc = workspace.getDocument(buf.id);
    if (!doc) {
      return await workspace.document;
    }
    return doc;
  }

  public async listInput(input: string): Promise<void> {
    // @ts-ignore
    await events.fire('InputChar', ['list', input, 0]);
  }

  public async getMarkers(
    bufnr: number,
    ns: number,
  ): Promise<[number, number, number][]> {
    return (await this.nvim.call('nvim_buf_get_extmarks', [
      bufnr,
      ns,
      0,
      -1,
      {},
    ])) as [number, number, number][];
  }

  public async getCmdline(): Promise<string> {
    let str = '';
    for (let i = 1, l = 70; i < l; i++) {
      const ch = await this.nvim.call('screenchar', [79, i]);
      if (ch === -1) {
        break;
      }
      str += String.fromCharCode(ch);
    }
    return str.trim();
  }

  public updateConfiguration(key: string, value: any): () => void {
    const { configurations } = workspace;
    const curr = workspace.getConfiguration(key);
    configurations.updateUserConfig({ [key]: value });
    return () => {
      configurations.updateUserConfig({ [key]: curr });
    };
  }

  public async mockFunction(
    name: string,
    result: string | number | any,
  ): Promise<void> {
    const content = `
    function! ${name}(...)
      return ${typeof result == 'number' ? result : JSON.stringify(result)}
    endfunction
    `;
    const file = await createTmpFile(content);
    await this.nvim.command(`source ${file}`);
  }

  public async items(): Promise<VimCompleteItem[]> {
    const context = (await this.nvim.getVar('coc#_context')) as any;
    return context['candidates'] || [];
  }

  public async screenLine(line: number): Promise<string> {
    let res = '';
    for (let i = 1; i <= 80; i++) {
      const ch = await this.nvim.call('screenchar', [line, i]);
      res = res + String.fromCharCode(ch);
    }
    return res;
  }

  public async getWinLines(winid: number): Promise<string[]> {
    return (await this.nvim.eval(
      `getbufline(winbufnr(${winid}), 1, '$')`,
    )) as string[];
  }

  public async getFloat(): Promise<Window | undefined> {
    const wins = await this.nvim.windows;
    let floatWin: Window | undefined;
    for (const win of wins) {
      const f = await win.getVar('float');
      if (f) {
        floatWin = win;
      }
    }
    return floatWin;
  }

  public async getFloats(): Promise<Window[]> {
    const ids = await this.nvim.call('coc#float#get_float_win_list', []);
    if (!ids) return [];
    return ids.map((id) => this.nvim.createWindow(id));
  }

  public async getExtmarkers(
    bufnr: number,
    ns: number,
  ): Promise<[number, number, number, number, string][]> {
    const res = await this.nvim.call('nvim_buf_get_extmarks', [
      bufnr,
      ns,
      0,
      -1,
      { details: true },
    ]);
    return res.map((o) => {
      return [o[1], o[2], o[3].end_row, o[3].end_col, o[3].hl_group];
    });
  }

  public async waitFor<T>(
    method: string,
    args: any[],
    value: T,
  ): Promise<void> {
    let find = false;
    for (let i = 0; i < 40; i++) {
      await this.wait(50);
      const res = (await this.nvim.call(method, args)) as T;
      if (
        res == value ||
        (value instanceof RegExp && value.test((res as any).toString()))
      ) {
        find = true;
        break;
      }
    }
    if (!find) {
      throw new Error(`waitFor ${value as unknown as string} timeout`);
    }
  }

  public async waitValue<T>(fn: () => T, value: T): Promise<void> {
    let find = false;
    for (let i = 0; i < 40; i++) {
      await this.wait(50);
      const res = fn();
      if (res == value) {
        find = true;
        break;
      }
    }
    if (!find) {
      throw new Error(`waitValue ${value as unknown as string} timeout`);
    }
  }

  public createNullChannel(): OutputChannel {
    return nullChannel;
  }
}

export function rmdir(dir: string): void {
  if (typeof fs['rm'] === 'function') {
    fs['rmSync'](dir, { recursive: true });
  } else {
    fs.rmdirSync(dir, { recursive: true });
  }
}

export async function createTmpFile(content: string): Promise<string> {
  const tmpFolder = path.join(os.tmpdir(), `coc-${process.pid}`);
  if (!fs.existsSync(tmpFolder)) {
    fs.mkdirSync(tmpFolder);
  }
  const fsPath = path.join(tmpFolder, uuid());
  await util.promisify(fs.writeFile)(fsPath, content, 'utf8');
  return fsPath;
}

export const jestHelper = new JestHelper(path.join(__dirname, '../../tests'));
