import { Window } from '@chemzqm/neovim';
import { Buffer, Disposable, disposeAll, events, workspace } from 'coc.nvim';
import { Merge } from 'type-fest';
import { floatingModule } from './modules/floating';
import { utilModule } from './modules/util';
import { helperAsyncCatch } from './util';

export namespace FloatingWindow {
  export type CreateInitedExecute = (context: { bufnr: string }) => string;
  export type OpenInitedExecute = (context: {
    bufnr: string;
    winid: string;
  }) => string;
  export type CreateOptions = Merge<
    floatingModule.CreateOptions,
    {
      inited_execute?: CreateInitedExecute;
      padding_inited_execute?: CreateInitedExecute;
      border_inited_execute?: CreateInitedExecute;
    }
  >;

  export type OpenOptions = Merge<
    floatingModule.OpenOptions,
    {
      inited_execute?: OpenInitedExecute;
      padding_inited_execute?: OpenInitedExecute;
      border_inited_execute?: OpenInitedExecute;
    }
  >;
}

const modePresets: Record<
  floatingModule.Mode,
  {
    modifiable?: boolean;
    focus?: boolean;
    createInitedExecute: FloatingWindow.CreateInitedExecute;
    openInitedExecute: FloatingWindow.OpenInitedExecute;
  }
> = {
  default: {
    modifiable: false,
    focus: false,
    createInitedExecute: () => '',
    openInitedExecute: () => '',
  },
  base: {
    createInitedExecute: (ctx) => `
      call setbufvar(${ctx.bufnr}, '&buftype', 'nofile')
      call setbufvar(${ctx.bufnr}, '&bufhidden', 'hide')
      call setbufvar(${ctx.bufnr}, '&buflisted', 0)

      call setbufvar(${ctx.bufnr}, '&swapfile', 0)

      call setbufvar(${ctx.bufnr}, '&modeline', 0)
    `,
    openInitedExecute: (ctx) => `
      call setbufvar(${ctx.bufnr}, '&list', 0)

      call setbufvar(${ctx.bufnr}, '&signcolumn', 'no')
      call setbufvar(${ctx.bufnr}, '&number', 0)
      call setbufvar(${ctx.bufnr}, '&relativenumber', 0)
      call setbufvar(${ctx.bufnr}, '&foldenable', 0)
      call setbufvar(${ctx.bufnr}, '&foldcolumn', 0)

      call setbufvar(${ctx.bufnr}, '&spell', 0)

      call setbufvar(${ctx.bufnr}, '&cursorcolumn', 0)
      call setbufvar(${ctx.bufnr}, '&cursorline', 0)
      call setbufvar(${ctx.bufnr}, '&colorcolumn', '')
    `,
  },
  show: {
    modifiable: false,
    createInitedExecute: (ctx) => `
      ${modePresets.base.createInitedExecute(ctx)}
      call setbufvar(${ctx.bufnr}, '&undofile', 0)
      call setbufvar(${ctx.bufnr}, '&undolevels', -1)

      call setbufvar(${ctx.bufnr}, '&modifiable', 0)
      call setbufvar(${ctx.bufnr}, '&modified', 0)
      call setbufvar(${ctx.bufnr}, '&readonly', 1)
    `,
    openInitedExecute: (ctx) => `
      ${modePresets.base.openInitedExecute(ctx)}
    `,
  },
};

const initedContextVars = {
  create: { bufnr: 'a:ctx.bufnr' },
  open: { bufnr: 'a:ctx.bufnr', winid: 'a:ctx.winid' },
};

export class FloatingWindow implements Disposable {
  buffer: Buffer;
  borderBuffer?: Buffer;
  win?: Window;
  borderWin?: Window;
  nvim = workspace.nvim;

  static async create(options: FloatingWindow.CreateOptions = {}) {
    const mode = options.mode ?? 'default';

    let inited_execute =
      options.inited_execute?.(initedContextVars.create) ?? '';
    inited_execute =
      modePresets[mode].createInitedExecute(initedContextVars.create) +
      '\n' +
      inited_execute;
    const padding_inited_execute =
      options.padding_inited_execute?.(initedContextVars.create) ??
      modePresets.show.createInitedExecute(initedContextVars.create);
    const border_inited_execute =
      options.border_inited_execute?.(initedContextVars.create) ??
      modePresets.show.createInitedExecute(initedContextVars.create);

    const [bufnr, borderBufnr, paddingBufnr]: [
      number,
      number | null,
      number | null,
    ] = await floatingModule.create.call({
      ...options,
      inited_execute,
      border_inited_execute,
      padding_inited_execute,
    });
    return new FloatingWindow(
      bufnr,
      borderBufnr ?? undefined,
      paddingBufnr ?? undefined,
      options,
      mode,
    );
  }

  private disposables: Disposable[] = [];

  protected constructor(
    public bufnr: number,
    public borderBufnr: number | undefined,
    public paddingBufnr: number | undefined,
    public createOptions: FloatingWindow.CreateOptions,
    public mode: floatingModule.Mode,
  ) {
    this.nvim = workspace.nvim;
    this.buffer = this.nvim.createBuffer(bufnr);
    if (borderBufnr) {
      this.borderBuffer = workspace.nvim.createBuffer(borderBufnr);
      this.disposables.push(
        events.on(
          'BufWinLeave',
          helperAsyncCatch(async (curBufnr) => {
            if (this.borderBufnr && curBufnr === this.bufnr) {
              await utilModule.closeWinByBufnr.call([this.borderBufnr]);
            }
            if (this.paddingBufnr && curBufnr === this.bufnr) {
              await utilModule.closeWinByBufnr.call([this.paddingBufnr]);
            }
          }),
        ),
      );
    }
  }

  protected getDefaultOptions(options: FloatingWindow.OpenOptions) {
    let inited_execute = options.inited_execute?.(initedContextVars.open) ?? '';
    inited_execute =
      modePresets[this.mode].openInitedExecute(initedContextVars.open) +
      '\n' +
      inited_execute;
    const padding_inited_execute =
      options.padding_inited_execute?.(initedContextVars.open) ??
      modePresets.show.openInitedExecute(initedContextVars.open);
    const border_inited_execute =
      options.border_inited_execute?.(initedContextVars.open) ??
      modePresets.show.openInitedExecute(initedContextVars.open);

    const modifiable =
      (this.mode ? modePresets[this.mode].modifiable : undefined) ??
      options.modifiable ??
      false;
    const focus =
      (this.mode ? modePresets[this.mode].focus : undefined) ??
      options.focus ??
      false;

    const finalOptions = {
      winhl: 'CocHelperNormalFloat',
      border_winhl: 'CocHelperNormalFloatBorder',
      relative: 'editor',
      ...options,
      inited_execute,
      padding_inited_execute,
      border_inited_execute,
      border_bufnr: this.borderBufnr,
      padding_bufnr: this.paddingBufnr,
      modifiable,
      focus,
    };
    return Object.entries(finalOptions).reduce((o, [key, val]) => {
      if (val === undefined) {
        return o;
      } else {
        o[key] = val;
        return o;
      }
    }, {} as floatingModule.OpenOptions);
  }

  async open(options: FloatingWindow.OpenOptions) {
    await this.close();

    if (options.width <= 0 || options.height <= 0) {
      return;
    }

    const finalOptions = this.getDefaultOptions(options);

    this.nvim.pauseNotification();
    this.buffer.setOption('modifiable', true, true);
    this.buffer.setOption('readonly', false, true);
    if (options.lines) {
      void this.buffer.setLines(options.lines, { start: 0, end: -1 }, true);
    }
    if (!finalOptions.modifiable) {
      this.buffer.setOption('modifiable', false, true);
      this.buffer.setOption('readonly', true, true);
    }
    if (options.highlights) {
      for (const hl of options.highlights) {
        void this.buffer.addHighlight(hl);
      }
    }
    await this.nvim.resumeNotification();

    const [winid, borderWinid] = await floatingModule.open.call(
      this.bufnr,
      finalOptions,
    );
    if (workspace.isVim) {
      await this.nvim.command('redraw!');
    }
    this.win = this.nvim.createWindow(winid);
    this.borderWin = borderWinid ? this.nvim.createWindow(winid) : undefined;
  }

  async resume(options: FloatingWindow.OpenOptions) {
    const finalOptions = this.getDefaultOptions(options);

    const [winid, borderWinid]: [
      number,
      number?,
    ] = await floatingModule.resume.call(this.bufnr, finalOptions);
    if (workspace.isVim) {
      await this.nvim.command('redraw!');
    }
    this.win = this.nvim.createWindow(winid);
    this.borderWin = borderWinid ? this.nvim.createWindow(winid) : undefined;
  }

  async resize(options: FloatingWindow.OpenOptions) {
    const finalOptions = this.getDefaultOptions(options);

    const [winid, borderWinid]: [
      number,
      number?,
    ] = await floatingModule.resize.call(this.bufnr, finalOptions);
    if (workspace.isVim) {
      await this.nvim.command('redraw!');
    }
    this.win = this.nvim.createWindow(winid);
    this.borderWin = borderWinid ? this.nvim.createWindow(winid) : undefined;
  }

  async close() {
    if (workspace.isNvim) {
      await utilModule.closeWinByBufnr.call([this.bufnr]);
    } else {
      if (this.win) {
        await this.nvim.call('popup_close', [this.win.id]).catch();
      }
    }
  }

  dispose() {
    disposeAll(this.disposables);
    this.disposables.forEach((s) => s.dispose());
  }
}
