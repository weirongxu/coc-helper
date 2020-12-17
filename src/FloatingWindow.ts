import { Buffer, Disposable, disposeAll, events, workspace } from 'coc.nvim';
import { BufferHighlight } from '@chemzqm/neovim';
import { Notifier } from './notifier';
import { floatingModule } from './modules/floating';
import { utilModule } from './modules/util';
import { helperAsyncCatch } from './util';
import { FloatingUtil } from './FloatingUtil';

export namespace FloatingWindow {
  export type Mode = 'default' | 'base' | 'show';
  export type CreateInitedExecute = (context: { bufnr: string }) => string;
  export type OpenInitedExecute = (context: {
    bufnr: string;
    winid: string;
  }) => string;

  export type CreateOptions = {
    /**
     * Buffer name
     */
    name?: string;
    mode?: Mode;
    initedExecute?: CreateInitedExecute;
    hasBorderBuf?: boolean;
    borderInitedExecute?: CreateInitedExecute;
  };

  export type OpenOptions = {
    /**
     * Relative position
     * @default 'editor'
     */
    relative?: 'center' | 'cursor' | 'cursor-around' | 'editor';
    /**
     * Top position
     * @default 0
     */
    top?: number;
    /**
     * Left position
     * @default 0
     */
    left?: number;
    /**
     * @default 0
     */
    topOffset?: number;
    /**
     * @default 0
     */
    leftOffset?: number;
    width: number;
    height: number;
    /**
     * Vim only
     */
    maxWidth?: number;
    /**
     * Vim only
     */
    maxHeight?: number;
    /**
     * Defining the padding, order is above/right/below/left.
     * Use empty list to make all with 1 padding
     */
    padding?: number[];
    /**
     * Defining the borders enable or not,
     * order is above/right/below/left.
     * Use empty list to enable all
     */
    border?: (boolean | number)[];
    /**
     * Border chars for floating window, their order is top/right/bottom/left/topleft/topright/botright/botleft
     */
    borderChars?: string[];
    borderOnly?: boolean;
    /**
     * Buffer name
     */
    name?: string;
    /**
     * Float win title
     */
    title?: string;
    filetype?: string;
    /**
     * Focus to window
     * Neovim only
     * @default false
     */
    focus?: boolean;
    /**
     * Focusable for window
     * Neovim only
     * @default true
     */
    focusable?: boolean;
    lines?: string[];
    highlights?: BufferHighlight[];
    modifiable?: boolean;
    winHl?: string;
    /**
     * Neovim only
     */
    winHlNC?: string;
    borderWinHl?: string;
    initedExecute?: OpenInitedExecute;
    borderInitedExecute?: OpenInitedExecute;
    context?: FloatingUtil.Context;
  };
}

export class FloatingWindow implements Disposable {
  static modePresets: Record<
    FloatingWindow.Mode,
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

        call setbufvar(${ctx.bufnr}, '&wrap', 1)

        call setbufvar(${ctx.bufnr}, '&swapfile', 0)

        call setbufvar(${ctx.bufnr}, '&modeline', 0)
      `,
      openInitedExecute: (ctx) => `
        call setbufvar(${ctx.bufnr}, '&list', 0)

        call setbufvar(${ctx.bufnr}, '&listchars', '')
        if has('nvim')
          call setbufvar(${ctx.bufnr}, '&fillchars', 'eob:\ ')
        endif

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
        ${FloatingWindow.modePresets.base.createInitedExecute(ctx)}
        " call setbufvar(${ctx.bufnr}, '&undofile', 0)
        " call setbufvar(${ctx.bufnr}, '&undolevels', -1)

        call setbufvar(${ctx.bufnr}, '&modifiable', 0)
        call setbufvar(${ctx.bufnr}, '&modified', 0)
        call setbufvar(${ctx.bufnr}, '&readonly', 1)
      `,
      openInitedExecute: (ctx) => `
        ${FloatingWindow.modePresets.base.openInitedExecute(ctx)}
      `,
    },
  };

  protected static initedContextVars = {
    create: { bufnr: 'a:ctx.bufnr' },
    open: { bufnr: 'a:ctx.bufnr', winid: 'a:ctx.winid' },
  };

  protected static getInitedExecute(
    mode: FloatingWindow.Mode,
    options: FloatingWindow.CreateOptions,
  ): [initedExecute: string, borderInitedExecute: string] {
    let initedExecute =
      options.initedExecute?.(FloatingWindow.initedContextVars.create) ?? '';
    initedExecute =
      FloatingWindow.modePresets[mode].createInitedExecute(
        FloatingWindow.initedContextVars.create,
      ) +
      '\n' +
      initedExecute;
    const borderInitedExecute =
      options.borderInitedExecute?.(FloatingWindow.initedContextVars.create) ??
      FloatingWindow.modePresets.show.createInitedExecute(
        FloatingWindow.initedContextVars.create,
      );
    return [initedExecute, borderInitedExecute];
  }

  static srcId = workspace.createNameSpace('coc-helper-floatwin');

  static async create(options: FloatingWindow.CreateOptions = {}) {
    const mode = options.mode ?? 'default';
    const [initedExecute, borderInitedExecute] = this.getInitedExecute(
      mode,
      options,
    );

    const [bufnr, borderBufnr] = await floatingModule.create.call(
      options.name ?? '',
      initedExecute,
      options.hasBorderBuf ?? true,
      borderInitedExecute,
    );

    const floatingUtil = new FloatingUtil(this.srcId);

    return new FloatingWindow(
      bufnr,
      borderBufnr ?? undefined,
      options,
      mode,
      floatingUtil,
    );
  }

  buffer: Buffer;
  borderBuffer?: Buffer;
  nvim = workspace.nvim;

  protected disposables: Disposable[] = [];

  protected constructor(
    public bufnr: number,
    public borderBufnr: number | undefined,
    public createOptions: FloatingWindow.CreateOptions,
    public mode: FloatingWindow.Mode,
    protected util: FloatingUtil,
  ) {
    this.nvim = workspace.nvim;
    this.buffer = this.nvim.createBuffer(bufnr);
    if (borderBufnr) {
      this.borderBuffer = workspace.nvim.createBuffer(borderBufnr);
      this.disposables.push(
        events.on(
          'BufWinLeave',
          helperAsyncCatch(async (curBufnr) => {
            // close border win
            if (this.borderBufnr && curBufnr === this.bufnr) {
              await utilModule.closeWinByBufnr.call([this.borderBufnr]);
            }
          }),
        ),
      );
    }
  }

  protected getInitedExecute(
    options: FloatingWindow.OpenOptions,
  ): [initedExecute: string, borderInitedExecute: string] {
    let initedExecute =
      options.initedExecute?.(FloatingWindow.initedContextVars.open) ?? '';
    initedExecute =
      FloatingWindow.modePresets[this.mode].openInitedExecute(
        FloatingWindow.initedContextVars.open,
      ) +
      '\n' +
      initedExecute;
    const borderInitedExecute =
      options.borderInitedExecute?.(FloatingWindow.initedContextVars.open) ??
      FloatingWindow.modePresets.show.openInitedExecute(
        FloatingWindow.initedContextVars.open,
      );
    return [initedExecute, borderInitedExecute];
  }

  protected getFocus(options: FloatingWindow.OpenOptions) {
    return (
      options.focus ??
      (this.mode ? FloatingWindow.modePresets[this.mode].focus : undefined) ??
      false
    );
  }

  protected getModifiable(options: FloatingWindow.OpenOptions) {
    return (
      options.modifiable ??
      (this.mode
        ? FloatingWindow.modePresets[this.mode].modifiable
        : undefined) ??
      false
    );
  }

  setLinesNotifier(options: FloatingWindow.OpenOptions) {
    return Notifier.create(() => {
      if (!options.lines && !options.modifiable) {
        return;
      }

      const modifiable = this.getModifiable(options);

      this.buffer.setOption('modifiable', true, true);
      this.buffer.setOption('readonly', false, true);
      if (options.lines) {
        void this.buffer.setLines(options.lines, { start: 0, end: -1 }, true);
      }
      if (!modifiable) {
        this.buffer.setOption('modifiable', false, true);
        this.buffer.setOption('readonly', true, true);
      }
      if (options.highlights) {
        for (const hl of options.highlights) {
          if (hl.srcId === undefined || hl.srcId === -1) {
            hl.srcId = 0;
          }
          void this.buffer.addHighlight(hl);
        }
      }
      if (workspace.isVim) {
        this.nvim.command('redraw!', true);
      }
    });
  }

  async setLines(options: FloatingWindow.OpenOptions) {
    await this.setLinesNotifier(options).run();
  }

  async opened() {
    const win = await this.win();
    return !!win;
  }

  async openNotifier(options: FloatingWindow.OpenOptions) {
    if (options.width <= 0 || options.height <= 0) {
      return Notifier.noop();
    }

    const notifiers: Notifier[] = [];
    notifiers.push(this.closeNotifier());

    const ctx = await this.util.createContext(options);
    const [initedExecute, borderInitedExecute] = this.getInitedExecute(options);
    const [winConfig, borderWinConfig] = this.util.winConfig(ctx, options);

    if (options.borderOnly && borderWinConfig) {
      notifiers.push(
        floatingModule.open.callNotifier(
          this.bufnr,
          borderWinConfig,
          borderInitedExecute,
          null,
          null,
          '',
          false,
          this.util.nvimWinHl(options),
        ),
      );
      notifiers.push(
        this.util.renderBorderNotifier(
          this.buffer,
          ctx,
          options,
          borderWinConfig,
        ),
      );
    } else {
      notifiers.push(
        floatingModule.open.callNotifier(
          this.bufnr,
          winConfig,
          initedExecute,
          this.borderBufnr ?? null,
          borderWinConfig ?? null,
          borderInitedExecute,
          this.getFocus(options),
          this.util.nvimWinHl(options),
        ),
      );
    }

    if (workspace.isNvim && this.borderBuffer && borderWinConfig) {
      notifiers.push(
        this.util.renderBorderNotifier(
          this.borderBuffer,
          ctx,
          options,
          borderWinConfig,
        ),
      );
    }

    notifiers.push(
      this.setLinesNotifier(options),
      Notifier.create(() => {
        if (options.filetype) {
          this.buffer.setOption('&filetype', options.filetype, true);
        }
      }),
    );

    return Notifier.combine(notifiers);
  }

  async open(options: FloatingWindow.OpenOptions) {
    await (await this.openNotifier(options)).run();
  }

  async resumeNotifier(options: FloatingWindow.OpenOptions) {
    const ctx = await this.util.createContext(options);
    const [winConfig, borderWinConfig] = this.util.winConfig(ctx, options);
    return Notifier.create(() => {
      floatingModule.resume.callNotify(
        this.bufnr,
        winConfig,
        this.borderBufnr ?? null,
        borderWinConfig ?? null,
        this.getFocus(options),
        this.util.nvimWinHl(options),
      );
      if (this.borderBuffer && borderWinConfig) {
        this.util
          .renderBorderNotifier(
            this.borderBuffer,
            ctx,
            options,
            borderWinConfig,
          )
          .notify();
      }
      if (workspace.isVim) {
        this.nvim.command('redraw!', true);
      }
    });
  }

  async resume(options: FloatingWindow.OpenOptions) {
    await (await this.resumeNotifier(options)).run();
  }

  async resizeNotifier(options: FloatingWindow.OpenOptions) {
    const ctx = await this.util.createContext(options);
    const [winConfig, borderWinConfig] = this.util.winConfig(
      ctx,
      options,
      false,
    );

    const notifiers: Notifier[] = [];

    if (options.borderOnly && borderWinConfig) {
      notifiers.push(
        floatingModule.update.callNotifier(
          this.bufnr,
          borderWinConfig,
          null,
          null,
          this.util.nvimWinHl(options),
        ),
      );
      notifiers.push(
        this.util.renderBorderNotifier(
          this.buffer,
          ctx,
          options,
          borderWinConfig,
        ),
      );
    } else {
      notifiers.push(
        floatingModule.update.callNotifier(
          this.bufnr,
          winConfig,
          this.borderBufnr ?? null,
          borderWinConfig ?? null,
          this.util.nvimWinHl(options),
        ),
      );
    }

    if (workspace.isNvim && this.borderBuffer && borderWinConfig) {
      notifiers.push(
        this.util.renderBorderNotifier(
          this.borderBuffer,
          ctx,
          options,
          borderWinConfig,
        ),
      );
    }

    notifiers.push(
      Notifier.create(() => {
        if (workspace.isVim) {
          this.nvim.command('redraw!', true);
        }
      }),
    );

    return Notifier.combine(notifiers);
  }

  async resize(options: FloatingWindow.OpenOptions) {
    await (await this.resizeNotifier(options)).run();
  }

  async win() {
    const winid = await floatingModule.winid.call(this.bufnr);
    return winid ? this.nvim.createWindow(winid) : undefined;
  }

  async borderWin() {
    const borderWinid = await floatingModule.winid.call(this.bufnr);
    return borderWinid ? this.nvim.createWindow(borderWinid) : undefined;
  }

  closeNotifier() {
    return floatingModule.close.callNotifier(this.bufnr);
  }

  async close() {
    await this.closeNotifier().run();
  }

  dispose() {
    disposeAll(this.disposables);
    this.disposables.forEach((s) => s.dispose());
  }
}
