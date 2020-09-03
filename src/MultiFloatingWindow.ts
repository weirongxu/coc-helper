import { Disposable, disposeAll, events, Neovim, workspace } from 'coc.nvim';
import { Merge } from 'type-fest';
import { Notifier } from '.';
import { FloatingUtil } from './FloatingUtil';
import { FloatingWindow } from './FloatingWindow';

export namespace MultiFloatingWindow {
  export type CreateOptions = Merge<
    FloatingWindow.CreateOptions,
    {
      wins: number | FloatingWindow.CreateOptions[];
    }
  >;

  export type OpenOptions = Merge<
    FloatingWindow.OpenOptions,
    {
      wins: FloatingWindow.OpenOptions[];
    }
  >;
}

export class MultiFloatingWindow implements Disposable {
  static async create(options: MultiFloatingWindow.CreateOptions) {
    const borderWin = await FloatingWindow.create({
      hasBorderBuf: false,
      mode: 'show',
      ...options,
    });
    const winsOptions =
      typeof options.wins === 'number'
        ? Array(options.wins).fill(() => ({}))
        : options.wins;
    const wins = await Promise.all(
      winsOptions.map((win) =>
        FloatingWindow.create({
          hasBorderBuf: false,
          ...win,
        }),
      ),
    );

    const borderSrcId = await FloatingWindow.borderSrcId();
    const util = new FloatingUtil(borderSrcId);
    return new MultiFloatingWindow(borderWin, wins, util);
  }

  public bufnrs: number[];
  protected disposables: Disposable[] = [];
  protected nvim: Neovim;

  protected constructor(
    public borderFloatWin: FloatingWindow,
    public floatWins: FloatingWindow[],
    protected util: FloatingUtil,
  ) {
    this.nvim = workspace.nvim;
    this.bufnrs = [borderFloatWin.bufnr, ...floatWins.map((w) => w.bufnr)];
    this.disposables.push(
      events.on('BufWinLeave', async (bufnr) => {
        if (this.bufnrs.includes(bufnr)) {
          await this.close();
        }
      }),
      Disposable.create(() => {
        borderFloatWin.dispose();
        disposeAll(floatWins);
      }),
    );
  }

  protected async batchAction(
    notifierAction: 'openNotifier' | 'resumeNotifier' | 'resizeNotifier',
    options: MultiFloatingWindow.OpenOptions,
    { reverse = false, updateCursorPosition = true } = {},
  ) {
    const ctx = await this.util.createContext(options);

    const { contentBox } = this.util.getBoxSizes(
      ctx,
      options,
      updateCursorPosition,
    );

    const notifiers: Notifier[] = [];
    for (var i = 0, len = this.floatWins.length; i < len; i++) {
      const win = this.floatWins[i];
      const winOptions = options.wins[i];
      if (winOptions) {
        notifiers.push(
          await win[notifierAction]({
            ...winOptions,
            relative: 'editor',
            top: contentBox[0] + winOptions.top,
            left: contentBox[1] + winOptions.left,
          }),
        );
      }
    }
    notifiers.push(
      await this.borderFloatWin[notifierAction]({
        ...options,
        borderOnly: true,
      }),
    );
    if (reverse) {
      notifiers.reverse();
    }
    await Notifier.runAll(notifiers);
  }

  async open(options: MultiFloatingWindow.OpenOptions) {
    return this.batchAction('openNotifier', options);
  }

  async resume(options: MultiFloatingWindow.OpenOptions) {
    return this.batchAction('resumeNotifier', options);
  }

  resize(options: MultiFloatingWindow.OpenOptions) {
    return this.batchAction('resizeNotifier', options);
  }

  async win() {
    return {
      borderWin: await this.borderFloatWin.win(),
      wins: await this.wins(),
    };
  }

  async wins() {
    return await Promise.all(this.floatWins.map((win) => win.win()));
  }

  async close() {
    const notifiers: Notifier[] = [];
    notifiers.push(this.borderFloatWin.closeNotifier());
    notifiers.push(...this.floatWins.map((win) => win.closeNotifier()));
    await Notifier.runAll(notifiers);
  }

  dispose() {
    disposeAll(this.disposables);
  }
}
