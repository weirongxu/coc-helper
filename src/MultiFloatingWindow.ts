import type { Neovim } from 'coc.nvim';
import { Disposable, disposeAll, events, workspace } from 'coc.nvim';
import { Notifier } from '.';
import { FloatingUtil } from './FloatingUtil';
import { FloatingWindow } from './FloatingWindow';

export namespace MultiFloatingWindow {
  export type CreateOptions<WinKeys extends string = string> =
    FloatingWindow.CreateOptions & {
      wins: Record<WinKeys, FloatingWindow.CreateOptions>;
    };

  export type OpenOptions<WinKeys extends string = string> =
    FloatingWindow.BaseOpenOptions & {
      /**
       * @default width by 'wins'
       */
      width?: number;
      /**
       * @default height by 'wins'
       */
      height?: number;
      wins: Partial<Record<WinKeys, FloatingWindow.OpenOptions>>;
    };
}

export class MultiFloatingWindow<WinKeys extends string = string>
  implements Disposable
{
  static async create<WinKeys extends string = string>(
    options: MultiFloatingWindow.CreateOptions<WinKeys>,
  ) {
    const borderWin = await FloatingWindow.create({
      hasBorderBuf: false,
      mode: 'show',
      ...options,
    });
    const wins = await Promise.all(
      Object.entries(options.wins).map(
        async ([key, win]) =>
          [
            key,
            await FloatingWindow.create({
              hasBorderBuf: false,
              ...(win as FloatingWindow),
            }),
          ] as const,
      ),
    );
    const winDict = wins.reduce((dict, [key, win]) => {
      dict[key] = win;
      return dict;
    }, {} as Record<string, FloatingWindow>);

    const util = new FloatingUtil(FloatingWindow.srcId);
    return new MultiFloatingWindow<WinKeys>(borderWin, winDict, util);
  }

  public bufnrs: number[];
  public floatWins: FloatingWindow[];
  protected disposables: Disposable[] = [];
  protected nvim: Neovim;

  protected constructor(
    public borderFloatWin: FloatingWindow,
    public floatWinDict: Record<WinKeys, FloatingWindow>,
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

  protected async sizeByWinsOptions(
    winsOptions: FloatingWindow.OpenOptions[],
  ): Promise<FloatingUtil.Size> {
    let width = 0,
      height = 0;
    for (const winOptions of winsOptions) {
      const ctx = await this.util.createContext(winOptions);
      const boxes = this.util.getBoxSizes(ctx, winOptions, false);
      const w = (winOptions.left ?? 0) + boxes.borderBox[2];
      if (w > width) {
        width = w;
      }
      const h = (winOptions.top ?? 0) + boxes.borderBox[3];
      if (h > height) {
        height = h;
      }
    }
    return [width, height];
  }

  protected async batchAction(
    notifierAction: 'openNotifier' | 'resumeNotifier' | 'resizeNotifier',
    options: MultiFloatingWindow.OpenOptions<WinKeys>,
    { reverse = false, updateCursorPosition = true } = {},
  ) {
    const [width, height] = await this.sizeByWinsOptions(
      Object.values(options.wins),
    );

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
      const winOptions:
        | undefined
        | {
            width: number;
            height: number;
            top: number;
            left: number;
          } = options.wins[key];
      if (!winOptions) {
        continue;
      }

      notifiers.push(
        await (floatWin as FloatingWindow)[notifierAction]({
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

  async open(options: MultiFloatingWindow.OpenOptions<WinKeys>) {
    return this.batchAction('openNotifier', options);
  }

  async resume(options: MultiFloatingWindow.OpenOptions<WinKeys>) {
    return this.batchAction('resumeNotifier', options);
  }

  resize(options: MultiFloatingWindow.OpenOptions<WinKeys>) {
    return this.batchAction('resizeNotifier', options, {
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
