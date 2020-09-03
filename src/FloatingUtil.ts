import { workspace, Buffer } from 'coc.nvim';
import { BufferHighlight } from '@chemzqm/neovim';
import { utilModule } from './modules/util';
import { FloatingWindow } from './FloatingWindow';
import { Notifier } from './notifier';
import { byteLength } from './util';

const defaultBorderChars = ['─', '│', '─', '│', '┌', '┐', '┘', '└'];
const defaultWinHl = 'CocHelperNormalFloat';
const defaultWinHlNC = 'CocHelperNormalFloatNC';
const defaultBorderWinHl = 'CocHelperNormalFloatBorder';

export namespace FloatingUtil {
  export type Edges = [
    top: number,
    right: number,
    bottom: number,
    left: number,
  ];
  /**
   * top and left is 0-index
   */
  export type Box = [top: number, left: number, width: number, height: number];
  /**
   * top and left is 0-index
   */
  export type Position = [top: number, left: number];
  export type Size = [width: number, height: number];

  export type Context = {
    lines: number;
    columns: number;
    globalCursorPosition: Position;
    title: { text: string; width: number };
    borderEnabled: boolean;
    border: Edges;
    paddingEnabled: boolean;
    padding: Edges;
  };

  export type WinConfig = VimWinConfig | NvimWinConfig;

  export type VimWinConfig = {
    line: number;
    col: number;
    zindex: number;
    minwidth: number;
    minheight: number;
    maxwidth: number;
    maxheight: number;
    pos?: string;
    highlight?: string;
    title?: string;
    padding?: number[];
    border?: number[];
    borderchars?: string[];
    borderhighlight?: string[];
    close?: 'button' | 'click' | 'none';
  };

  export type NvimWinConfig = {
    relative: string;
    row: number;
    col: number;
    width: number;
    height: number;
    focusable: boolean;
  };
}

export class FloatingUtil {
  constructor(protected borderSrcId: number) {}

  async createContext(
    options: FloatingWindow.OpenOptions,
  ): Promise<FloatingUtil.Context> {
    return (
      options.context ?? {
        lines: workspace.env.lines,
        columns: workspace.env.columns - workspace.env.cmdheight - 1,
        globalCursorPosition: await utilModule.globalCursorPosition.call(),
        title: options.title
          ? {
              text: options.title,
              width: await workspace.nvim.call('strdisplaywidth', [
                options.title,
              ]),
            }
          : { text: '', width: 0 },
        borderEnabled: !!options.border,
        border: this.extendEdges(
          options.border?.map((b) => (typeof b === 'boolean' ? 1 : b)),
        ),
        paddingEnabled: !!options.padding,
        padding: this.extendEdges(options.padding),
      }
    );
  }

  protected storeCursorPosition?: FloatingUtil.Position;

  getCenterPos(
    ctx: FloatingUtil.Context,
    box: FloatingUtil.Box,
  ): FloatingUtil.Position {
    const [, , width, height] = box;
    const top = Math.floor((ctx.lines - height) / 2);
    const left = Math.floor((ctx.columns - width) / 2);
    return [top, left];
  }

  getPosForAround(
    ctx: FloatingUtil.Context,
    size: FloatingUtil.Size,
    cursorPosition: FloatingUtil.Position,
    preferAbove = false,
  ): FloatingUtil.Position {
    const columns = ctx.columns;
    const lines = ctx.lines - 1;
    const [width, height] = size;
    let [top, left] = cursorPosition;
    if (preferAbove) {
      if (top - height < 0) {
        top += 1;
      } else {
        top -= height;
      }
    } else {
      if (top + height >= lines) {
        top -= height;
      } else {
        top += 1;
      }
    }
    if (left + width >= columns) {
      left -= width - 1;
    }
    return [top, left];
  }

  /**
   * Extend around number to 4
   */
  extendEdges(edges?: number[]): FloatingUtil.Edges {
    if (!edges) {
      return [0, 0, 0, 0];
    }
    const top = edges[0] ?? 1;
    const right = edges[1] ?? top;
    const bottom = edges[2] ?? top;
    const left = edges[3] ?? right;
    return [top, right, bottom, left];
  }

  /**
   * Change window box by around edges
   */
  changeBoxByEdgesList(
    box: FloatingUtil.Box,
    edgesList: (FloatingUtil.Edges | undefined)[],
  ): FloatingUtil.Box {
    let retBox: FloatingUtil.Box = [...box];
    for (const edges of edgesList) {
      retBox = this.changeBoxByEdges(retBox, edges);
    }
    return retBox;
  }

  /**
   * Change window box by around edge
   */
  changeBoxByEdges(
    box: FloatingUtil.Box,
    edges?: FloatingUtil.Edges,
  ): FloatingUtil.Box {
    if (!edges) {
      return box;
    }
    const [wTop, wRight, wBottom, wLeft] = edges;
    let [top, left, width, height] = box;
    top -= wTop;
    left -= wLeft;
    width += wLeft + wRight;
    height += wTop + wBottom;
    return [top, left, width, height];
  }

  getBoxSizes(
    ctx: FloatingUtil.Context,
    options: FloatingWindow.OpenOptions,
    updateCursorPosition: boolean,
  ) {
    const width = Math.max(options.width, ctx.title.width);
    const contentBox: FloatingUtil.Box = [0, 0, width, options.height];
    const paddingBox = this.changeBoxByEdges(contentBox, ctx.padding);
    const borderBox = this.changeBoxByEdges(paddingBox, ctx.border);

    let fullPos: FloatingUtil.Position;
    if (options.relative === 'center') {
      fullPos = this.getCenterPos(ctx, borderBox);
    } else {
      const cursorPosition =
        !updateCursorPosition && this.storeCursorPosition
          ? this.storeCursorPosition
          : ctx.globalCursorPosition;
      if (options.relative === 'cursor') {
        fullPos = cursorPosition;
      } else if (options.relative === 'cursor-around') {
        fullPos = this.getPosForAround(
          ctx,
          [borderBox[2], borderBox[3]],
          cursorPosition,
        );
      } else {
        fullPos = [options.top, options.left];
      }
      this.storeCursorPosition = cursorPosition;
    }

    [borderBox[0], borderBox[1]] = [fullPos[0], fullPos[1]];
    [paddingBox[0], paddingBox[1]] = [
      borderBox[0] + ctx.border[0],
      borderBox[1] + ctx.border[3],
    ];
    [contentBox[0], contentBox[1]] = [
      paddingBox[0] + ctx.padding[0],
      paddingBox[1] + ctx.padding[3],
    ];

    return {
      contentBox,
      paddingBox,
      borderBox,
    };
  }

  vimWinConfig(
    ctx: FloatingUtil.Context,
    options: FloatingWindow.OpenOptions,
    updateCursorPosition: boolean,
  ): FloatingUtil.VimWinConfig {
    const [top, left, width, height] = [
      options.top,
      options.left,
      options.width,
      options.height,
    ];
    const config: FloatingUtil.VimWinConfig = {
      line: 0,
      col: 0,
      zindex: options.borderOnly ?? false ? 1 : 100,
      minwidth: width,
      minheight: height,
    };
    if (options.relative === 'center') {
      config.pos = 'center';
    } else {
      const cursorPosition =
        !updateCursorPosition && this.storeCursorPosition
          ? this.storeCursorPosition
          : ctx.globalCursorPosition;
      if (options.relative === 'cursor') {
        [config.line, config.col] = cursorPosition;
      } else if (options.relative === 'cursor-around') {
        const box = this.changeBoxByEdgesList(
          [top, left, width, height],
          [ctx.padding, ctx.border],
        );
        [config.line, config.col] = this.getPosForAround(
          ctx,
          [box[2], box[3]],
          cursorPosition,
        );
      } else {
        [config.line, config.col] = [options.top, options.left];
      }
      this.storeCursorPosition = cursorPosition;
      config.line += 1;
      config.col += 1;
    }
    const topOffset = options.topOffset ?? 0;
    const leftOffset = options.leftOffset ?? 0;
    config.line += topOffset;
    config.col += leftOffset;
    config.maxwidth = options.maxWidth ?? options.width;
    config.maxheight = options.maxHeight ?? options.height;
    config.highlight = options.winHl ?? defaultWinHl;
    if (options.padding) {
      config.padding = options.padding;
    }
    if (ctx.borderEnabled) {
      config.border = ctx.border;
      if (config.border[0]) {
        if (ctx.title.width) {
          config.title = ctx.title.text;
        }
        config.close = 'button';
      }
      config.borderchars = options.borderChars ?? defaultBorderChars;
      config.borderhighlight = [options.borderWinHl ?? defaultBorderWinHl];
    }
    return config;
  }

  nvimWinConfig(
    ctx: FloatingUtil.Context,
    options: FloatingWindow.OpenOptions,
    updateCursorPosition: boolean,
  ): [
    winConfig: FloatingUtil.NvimWinConfig,
    borderWinConfig?: FloatingUtil.NvimWinConfig,
  ] {
    const { contentBox, borderBox } = this.getBoxSizes(
      ctx,
      options,
      updateCursorPosition,
    );

    const topOffset = options.topOffset ?? 0;
    const leftOffset = options.leftOffset ?? 0;

    const winConfig: FloatingUtil.NvimWinConfig = {
      relative: 'editor',
      row: contentBox[0] + topOffset,
      col: contentBox[1] + leftOffset,
      width: contentBox[2],
      height: contentBox[3],
      focusable: true,
    };
    let winConfigBorder: FloatingUtil.NvimWinConfig | undefined;
    if (borderBox) {
      winConfigBorder = {
        relative: 'editor',
        row: borderBox[0] + topOffset,
        col: borderBox[1] + leftOffset,
        width: borderBox[2],
        height: borderBox[3],
        focusable: false,
      };
    }

    return [winConfig, winConfigBorder];
  }

  winConfig(
    ctx: FloatingUtil.Context,
    options: FloatingWindow.OpenOptions,
    updateCursorPosition = true,
  ): [
    winConfig: FloatingUtil.WinConfig,
    borderWinConfig?: FloatingUtil.NvimWinConfig,
  ] {
    return workspace.isVim
      ? [this.vimWinConfig(ctx, options, updateCursorPosition), undefined]
      : this.nvimWinConfig(ctx, options, updateCursorPosition);
  }

  getRenderBorderData(
    ctx: FloatingUtil.Context,
    options: FloatingWindow.OpenOptions,
    winOptions: FloatingUtil.Size,
  ) {
    const title = ctx.title?.text ?? '';
    const titleWidth = ctx.title?.width ?? 0;
    if (!ctx.borderEnabled) {
      return;
    }

    const [bTop, bRight, bBottom, bLeft] = ctx.border;
    let [
      cTop,
      cRight,
      cBottom,
      cLeft,
      cTopleft,
      cTopright,
      cBotright,
      cBotleft,
    ] = options.borderChars ?? defaultBorderChars;
    if (!bTop) {
      cTop = '';
    }
    if (!bRight) {
      cRight = '';
    }
    if (!bBottom) {
      cBottom = '';
    }
    if (!bLeft) {
      cLeft = '';
    }
    if (!bTop || !bLeft) {
      cTopleft = '';
    }
    if (!bTop || !bRight) {
      cTopright = '';
    }
    if (!bBottom || !bLeft) {
      cBotleft = '';
    }
    if (!bBottom || !bRight) {
      cBotright = '';
    }

    const width = winOptions[0];
    const height = winOptions[1];
    const spaceWidth = width - bLeft - bRight;
    const spaceHeight = height - bTop - bBottom;

    const lines: string[] = [];
    if (bTop) {
      lines.push(
        cTopleft + title + cTop.repeat(spaceWidth - titleWidth) + cTopright,
      );
    }
    lines.push(
      ...Array.from(
        { length: spaceHeight },
        () => cLeft + ' '.repeat(spaceWidth) + cRight,
      ),
    );
    if (bBottom) {
      lines.push(cBotleft + cBottom.repeat(spaceWidth) + cBotright);
    }

    const highlights: BufferHighlight[] = [];
    const borderWinHl = options.borderWinHl ?? defaultBorderWinHl;
    if (borderWinHl) {
      highlights.push({
        srcId: this.borderSrcId,
        hlGroup: borderWinHl,
        line: 0,
        colStart: 0,
        colEnd: -1,
      });
      for (let l = 0, len = spaceHeight; l < len; l++) {
        if (bLeft) {
          highlights.push({
            srcId: this.borderSrcId,
            hlGroup: borderWinHl,
            line: l + 1,
            colStart: 0,
            colEnd: byteLength(cLeft),
          });
        }
        if (bRight) {
          highlights.push({
            srcId: this.borderSrcId,
            hlGroup: borderWinHl,
            line: l + 1,
            colStart: byteLength(cLeft) + spaceWidth,
            colEnd: -1,
          });
        }
      }
      if (bBottom) {
        highlights.push({
          srcId: this.borderSrcId,
          hlGroup: borderWinHl,
          line: height - 1,
          colStart: 0,
          colEnd: -1,
        });
      }
    }

    return {
      lines,
      highlights,
    };
  }

  renderBorderNotifier(
    buf: Buffer,
    ctx: FloatingUtil.Context,
    options: FloatingWindow.OpenOptions,
    winOptions: FloatingUtil.WinConfig,
  ) {
    const renderData = this.getRenderBorderData(
      ctx,
      options,
      'width' in winOptions
        ? [winOptions.width, winOptions.height]
        : [winOptions.minwidth, winOptions.minheight],
    );
    if (!renderData) {
      return Notifier.noop();
    }

    const { lines, highlights } = renderData;
    return Notifier.create(() => {
      buf.setOption('modifiable', true, true);
      buf.setOption('readonly', false, true);
      void buf.setLines(lines, { start: 0, end: -1 }, true);
      buf.setOption('modifiable', false, true);
      buf.setOption('readonly', true, true);
      for (const hl of highlights) {
        void buf.addHighlight(hl);
      }
    });
  }

  nvimWinHl(options: FloatingWindow.OpenOptions) {
    if (workspace.isVim) {
      return '';
    }
    const arr: string[] = [];
    arr.push('Normal:' + (options.winHl ?? defaultWinHl));
    arr.push('NormalNC:' + (options.winHlNC ?? defaultWinHlNC));
    return arr.join(',');
  }
}