import { Disposable, disposeAll, events, Neovim, workspace } from 'coc.nvim';
import { Merge } from 'type-fest';
import { Notifier } from '.';
import { FloatingUtil } from './FloatingUtil';
import { FloatingWindow } from './FloatingWindow';

export namespace MultiFloatingWindow {
  export type CreateOptions = Merge<
    FloatingWindow.CreateOptions,
    {
      wins: number | Record<string, FloatingWindow.CreateOptions>;
    }
  >;

  export type OpenOptions = Merge<
    FloatingWindow.OpenOptions,
    {
      /**
       * @default width by 'wins'
       */
      width?: number;
      /**
       * @default height by 'wins'
       */
      height?: number;
      wins: Record<string, FloatingWindow.OpenOptions>;
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
      Object.entries(winsOptions).map(
        async ([key, win]: [string, FloatingWindow.CreateOptions]) =>
          [
            key,
            await FloatingWindow.create({
              hasBorderBuf: false,
              ...win,
            }),
          ] as const,
      ),
    );
    const winDict = wins.reduce((dict, [key, win]) => {
      dict[key] = win;
      return dict;
    }, {} as Record<string, FloatingWindow>);

    const borderSrcId = await FloatingWindow.borderSrcId();
    const util = new FloatingUtil(borderSrcId);
    return new MultiFloatingWindow(borderWin, winDict, util);
  }

  public bufnrs: number[];
  public floatWins: FloatingWindow[];
  protected disposables: Disposable[] = [];
  protected nvim: Neovim;

  protected constructor(
    public borderFloatWin: FloatingWindow,
    public floatWinDict: Record<string, FloatingWindow>,
    protected util: FloatingUtil,
  ) {
    this.floatWins = Object.values(this.floatWinDict);
    this.nvim = workspace.nvim;
    this.bufnrs = [borderFloatWin.bufnr, ...this.floatWins.map((w) => w.bufnr)];
    this.disposables.push(
      events.on('BufWinLeave', async (bufnr) => {
        if (this.bufnrs.includes(bufnr)) {
          await this.close();
        }
      }),
      Disposable.create(() => {
        borderFloatWin.dispose();
        disposeAll(this.floatWins);
      }),
    );
  }

  async opened() {
    return this.borderFloatWin.opened();
  }

  protected sizeByWinsOptions(
    winsOptions: FloatingWindow.OpenOptions[],
  ): FloatingUtil.Size {
    let width = 0,
      height = 0;
    for (const winOptions of winsOptions) {
      const w = (winOptions.left ?? 0) + winOptions.width;
      if (w > width) {
        width = w;
      }
      const h = (winOptions.top ?? 0) + winOptions.height;
      if (h > height) {
        height = h;
      }
    }
    return [width, height];
  }

  protected async batchAction(
    notifierAction: 'openNotifier' | 'resumeNotifier' | 'resizeNotifier',
    options: MultiFloatingWindow.OpenOptions,
    { reverse = false, updateCursorPosition = true } = {},
  ) {
    const [width, height] = this.sizeByWinsOptions(Object.values(options.wins));

    const finalOptions = {
      width,
      height,
      ...options,
    };

    const ctx = await this.util.createContext(finalOptions);

    const { contentBox } = this.util.getBoxSizes(
      ctx,
      finalOptions,
      updateCursorPosition,
    );

    const notifiers: Notifier[] = [];
    for (const [key, floatWin] of Object.entries(this.floatWinDict)) {
      const winOptions = options.wins[key];
      if (!winOptions) {
        continue;
      }

      notifiers.push(
        await floatWin[notifierAction]({
          ...winOptions,
          relative: 'editor',
          top: contentBox[0] + (winOptions.top ?? 0),
          left: contentBox[1] + (winOptions.left ?? 0),
        }),
      );
    }

    notifiers.push(
      await this.borderFloatWin[notifierAction]({
        ...finalOptions,
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
    return this.batchAction('resumeNotifier', options, { reverse: true });
  }

  resize(options: MultiFloatingWindow.OpenOptions) {
    return this.batchAction('resizeNotifier', options, {
      reverse: true,
      updateCursorPosition: false,
    });
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
