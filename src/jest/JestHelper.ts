/*---------------------------------------------------------------------------------------------
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *
 * 2018-2020 Qiming Zhao <chemzqm@gmail.com>
 * 2020 Weirong Xu <weirongxu.raidou@gmail.com>
 *--------------------------------------------------------------------------------------------*/
/**
 * modified from: https://github.com/neoclide/coc.nvim/blob/f40fdf889f65412d763cf43995f707b4b461e9f2/src/__tests__/helper.ts
 */

import { Buffer, Neovim, Window } from '@chemzqm/neovim';
import * as cp from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import pathLib from 'path';
import util from 'util';
import { v4 as uuid } from 'uuid';
// @ts-ignore
import attach from 'coc.nvim/lib/attach';
// @ts-ignore
import Plugin from 'coc.nvim/lib/plugin';
import { workspace, VimCompleteItem, Document } from 'coc.nvim';

// @ts-ignore
global.__TEST__ = true;

process.on('uncaughtException', (err) => {
  const msg = 'Uncaught exception: ' + err.stack;
  // eslint-disable-next-line no-console
  console.error(msg);
});

export class JestHelper extends EventEmitter {
  private _nvim?: Neovim;
  private _plugin?: Plugin;

  public proc?: cp.ChildProcess;

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
      await this.setup();
    });

    afterAll(async () => {
      await this.shutdown();
    });

    afterEach(async () => {
      await this.reset();
    });
  }

  public async setup(): Promise<void> {
    const vimrcPath = pathLib.join(this.testsDir, 'vimrc');
    const proc = (this.proc = cp.spawn(
      'nvim',
      ['-u', vimrcPath, '-i', 'NONE', '--embed'],
      {
        cwd: this.testsDir,
      },
    ));
    const plugin = (this.plugin = attach({ proc }));
    this.nvim = (plugin.nvim as unknown) as Neovim;
    this.nvim.uiAttach(160, 80, {}).catch((_e) => {
      // noop
    });
    proc.on('exit', () => {
      this.proc = undefined;
    });
    this.nvim.on('notification', (method, args) => {
      if (method === 'redraw') {
        for (const arg of args) {
          const event = arg[0];
          this.emit(event, arg.slice(1));
        }
      }
    });
    return new Promise((resolve) => {
      plugin.once('ready', resolve);
    });
  }

  public async shutdown(): Promise<void> {
    this.plugin.dispose();
    await this.nvim.quit();
    if (this.proc) {
      this.proc.kill('SIGKILL');
    }
    await this.wait(60);
  }

  public async waitPopup(): Promise<void> {
    for (let i = 0; i < 40; i++) {
      await this.wait(50);
      const visible = await this.nvim.call('pumvisible');
      if (visible) {
        return;
      }
    }
    throw new Error('timeout after 2s');
  }

  public async waitFloat(): Promise<number> {
    for (let i = 0; i < 40; i++) {
      await this.wait(50);
      const winid = await this.nvim.call('coc#util#get_float');
      if (winid) {
        return winid;
      }
    }
    throw new Error('timeout after 2s');
  }

  public async selectCompleteItem(idx: number): Promise<void> {
    await this.nvim.call('nvim_select_popupmenu_item', [idx, true, true, {}]);
  }

  public async reset(): Promise<void> {
    const mode = await this.nvim.call('mode');
    if (mode !== 'n') {
      await this.nvim.command('stopinsert');
      await this.nvim.call('feedkeys', [String.fromCharCode(27), 'in']);
    }
    await this.nvim.command('silent! %bwipeout!');
    await this.wait(60);
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
    if (!items) {
      return false;
    }
    const item = items.find((o: { word: string }) => o.word === word);
    if (!item || !item.user_data) {
      return false;
    }
    try {
      const o = JSON.parse(item.user_data);
      if (source && o.source !== source) {
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
    if (!file || !pathLib.isAbsolute(file)) {
      file = pathLib.join(__dirname, file ? file : `${uuid()}`);
    }
    const escaped = await this.nvim.call('fnameescape', file);
    await this.nvim.command(`edit ${escaped}`);
    await this.wait(60);
    const bufnr = (await this.nvim.call('bufnr', ['%'])) as number;
    return this.nvim.createBuffer(bufnr);
  }

  public async createDocument(name?: string): Promise<Document> {
    const buf = await this.edit(name);
    const doc = workspace.getDocument(buf.id);
    if (!doc) {
      return await workspace.document;
    }
    return doc;
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

  public updateConfiguration(key: string, value: any): void {
    const { configurations } = workspace as any;
    configurations.updateUserConfig({ [key]: value });
  }

  public async mockFunction(
    name: string,
    result: string | number | any,
  ): Promise<void> {
    const content = `
    function! ${name}(...)
      return ${JSON.stringify(result)}
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
}

async function createTmpFile(content: string): Promise<string> {
  const tmpFolder = pathLib.join(os.tmpdir(), `coc-${process.pid}`);
  if (!fs.existsSync(tmpFolder)) {
    fs.mkdirSync(tmpFolder);
  }
  const filename = pathLib.join(tmpFolder, uuid());
  await util.promisify(fs.writeFile)(filename, content, 'utf8');
  return filename;
}

export const jestHelper = new JestHelper(
  pathLib.join(__dirname, '../../tests'),
);
