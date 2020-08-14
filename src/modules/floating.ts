import { BufferHighlight } from '@chemzqm/neovim';
import { workspace } from 'coc.nvim';
import { VimModule } from '../VimModule';
import { bufModule } from './buf';

export namespace floatingModule {
  export type Mode = 'default' | 'base' | 'show';
  export type CreateInitedExecute = (context: { bufnr: string }) => string;
  export type OpenInitedExecute = (context: {
    bufnr: string;
    winid: string;
  }) => string;

  export interface CreateOptions {
    /**
     * Buffer name
     */
    name?: string;
    mode?: Mode;
    inited_execute?: string;
    border_inited_execute?: string;
    padding_inited_execute?: string;
  }

  export interface OpenOptions {
    /**
     * Relative position, not support the 'win' in vim
     * @default 'editor'
     */
    relative?: 'center' | 'cursor' | 'win' | 'editor';
    width: number;
    height: number;
    /**
     * Left position
     */
    left: number;
    /**
     * Top position
     */
    top: number;
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
    border?: boolean[];
    /**
     * Border chars for floating window, their order is top/right/bottom/left/topleft/topright/botright/botleft
     */
    border_chars?: string[];
    /**
     * Buffer name
     */
    name?: string;
    /**
     * Float win title
     */
    title?: string;
    filetype?: string;
    focus?: boolean;
    lines?: string[];
    highlights?: BufferHighlight[];
    modifiable?: boolean;
    winhl?: string;
    /**
     * Nvim only
     */
    winhlNC?: string;
    border_winhl?: string;
    border_winhlNC?: string;
    inited_execute?: string;
    border_inited_execute?: string;
    padding_inited_execute?: string;
  }
}

const isNvim = workspace.isNvim;

export const floatingModule = VimModule.create('float', (m) => {
  const getCenterPosition = m.fn<
    [floatingModule.OpenOptions],
    [number, number]
  >(
    'get_center_position',
    ({ name }) => `
      function ${name}(options) abort
        let columns = &columns
        let lines = &lines - &cmdheight - 1
        let width = a:options.width
        let height = a:options.height
        let top = (lines - height) / 2
        let left = (columns - width) / 2
        return [top, left]
      endfunction
    `,
  );

  const vimWinConfig = m.fn<
    [floatingModule.OpenOptions],
    {
      line: number;
      col: number;
      maxwidth: number;
      maxheight: number;
      highlight: string;
      padding?: number[];
      border?: boolean[];
      borderchars?: string[];
      close?: 'button' | 'click' | 'none';
      borderhighlight?: string;
    }
  >(
    'vim_win_config',
    ({ name }) => `
      function! ${name}(options) abort
        if a:options.relative == 'center'
          let [top, left] = ${getCenterPosition.name}(a:options)
        else
          let top = a:options.top
          let left = a:options.left
          if a:options.relative == 'cursor'
            if top >= 0
              let top = 'cursor+' . (top + 1)
            else
              let top = 'cursor' . top
            endif
          else
            let top = top + 1
            let left = left + 1
          endif
        endif
        let config = {
              \\ 'line': top,
              \\ 'col': left,
              \\ 'maxwidth': a:options.width,
              \\ 'maxheight': a:options.height,
              \\ 'highlight': get(a:options, 'winhl'),
              \\ }
        if has_key(a:options, 'border')
          let config.border = a:options.border
          let config.close = 'button'
          if has_key(a:options, 'border_chars')
            let config.borderchars = a:options.border_chars
          endif
          if has_key(a:options, 'border_winhl')
            let config.borderhighlight = a:options.border_winhl
          endif
        endif
        return config
      endfunction
    `,
  );

  type AroundWidth<T> = [T, T, T, T];
  /**
   * Extend around number to 4
   * @return [top, right, down, left]
   */
  const nvimExtendAroundWidth:
    | VimModule.FnCaller<boolean[], AroundWidth<boolean>>
    | VimModule.FnCaller<number[], AroundWidth<boolean>> = m.fn<[any], any>(
    'nvim_extend_around_width',
    ({ name }) => `
      function! ${name}(widths) abort
        let len = len(a:widths)
        let top = a:widths[0]
        let right = top
        if len >= 2
          let right = a:widths[1]
        endif
        let down = top
        if len >= 3
          let down = a:widths[2]
        endif
        let left = right
        if len >= 4
          let left = a:widths[3]
        endif
        return [top, right, down, left]
      endfunction
    `,
  );

  /**
   * Change window size by around width
   * argument [top, left, width, height]
   * @return [top, left, width, height]
   */
  const nvimSizeWithAroundWidth = m.fn<
    [(number | boolean)[], AroundWidth<number>],
    AroundWidth<number>[]
  >(
    'nvim_size_around_width',
    ({ name }) => `
      function! ${name}(widths, size) abort
        if len(a:widths)
          let [w_top, w_right, w_down, w_left] = ${nvimExtendAroundWidth.name}(a:widths)
        else
          let [w_top, w_right, w_down, w_left] = [1, 1, 1, 1]
        endif
        let [top, left, width, height] = a:size
        let top -= w_top
        let left -= w_left
        let width += w_left + w_right
        let height += w_top + w_down
        return [top, left, width, height]
      endfunction
    `,
  );

  type NvimWinConfig = {
    relative: string;
    row: number;
    col: number;
    width: number;
    height: number;
  };
  const nvimWinConfig = m.fn<
    [floatingModule.OpenOptions, 'win' | 'border' | 'padding'],
    NvimWinConfig
  >(
    'nvim_win_config',
    ({ name }) => `
      function! ${name}(options, type) abort
        let focusable = v:true
        if a:options.relative == 'center'
          let [top, left] = ${getCenterPosition.name}(a:options)
          let relative = 'editor'
        else
          let top = a:options.top
          let left = a:options.left
          let relative = a:options.relative
        endif
        let size = [top, left, a:options.width, a:options.height]
        if a:type == 'border'
          let focusable = v:false
          if has_key(a:options, 'padding')
            let size = ${nvimSizeWithAroundWidth.name}(a:options.padding, size)
          endif
          if has_key(a:options, 'border')
            let size = ${nvimSizeWithAroundWidth.name}(a:options.border, size)
          endif
        elseif a:type == 'padding'
          let focusable = v:false
          if has_key(a:options, 'padding')
            let size = ${nvimSizeWithAroundWidth.name}(a:options.padding, size)
          endif
        endif
        let [top, left, width, height] = size
        return {
              \\ 'relative': relative,
              \\ 'row': top,
              \\ 'col': left,
              \\ 'width': width,
              \\ 'height': height,
              \\ 'focusable': focusable,
              \\ }
      endfunction
  `,
  );

  const initExecute = m.fn<[object, string], void>(
    'init_execute',
    ({ name }) => `
      function! ${name}(ctx, inited_execute) abort
        execute a:inited_execute
      endfunction
    `,
  );

  const nvimBorderRender = m.fn<
    [number, floatingModule.OpenOptions, NvimWinConfig],
    void
  >(
    'nvim_border_render',
    ({ name }) => `
      function! ${name}(bufnr, options, win_options) abort
        let repeat_width = a:win_options.width - 2
        let repeat_height = a:win_options.height - 2
        let title = get(a:options, 'title', '')
        let title_width = strdisplaywidth(title)

        let border_chars = get(a:options, 'border_chars', ['─', '│', '─', '│', '┌', '┐', '┘', '└'])
        let [c_top, c_right, c_bottom, c_left, c_topleft, c_topright, c_botright, c_botleft] = border_chars
        let content = [c_topleft . title . repeat(c_top, repeat_width - title_width) . c_topright]
        let content += repeat([c_left . repeat(' ', repeat_width) . c_right], repeat_height)
        let content += [c_botleft . repeat(c_bottom, repeat_width) . c_botright]

        call nvim_buf_set_option(a:bufnr, 'modifiable', v:true)
        call nvim_buf_set_option(a:bufnr, 'readonly', v:false)
        call nvim_buf_set_lines(a:bufnr, 0, -1, v:false, content)
        call nvim_buf_set_option(a:bufnr, 'modifiable', v:false)
        call nvim_buf_set_option(a:bufnr, 'readonly', v:true)
      endfunction
    `,
  );

  const nvimWinhl = m.fn<[number, string | null, string | null], void>(
    'nvim_winhl',
    ({ name }) => `
      function! ${name}(winid, normal, normalNC) abort
        let options = []
        if !empty(a:normal)
          let options += ['Normal:' . a:normal]
        endif
        if !empty(a:normalNC)
          let options += ['NormalNC:' . a:normalNC]
        endif
        call nvim_win_set_option(a:winid, 'winhl', join(options, ','))
      endfunction
    `,
  );

  return {
    create: m.fn<
      [floatingModule.CreateOptions],
      [number, number | null, number | null]
    >('create', ({ name }) =>
      isNvim
        ? `
            function! ${name}(options) abort
              let name = get(a:options, 'name', '')
              let border_bufnr = nvim_create_buf(v:false, v:true)
              let padding_bufnr = nvim_create_buf(v:false, v:true)
              let bufnr = ${bufModule.create.name}(name)
              call ${initExecute.name}({'bufnr': bufnr}, get(a:options, 'inited_execute', ''))
              call ${initExecute.name}({'bufnr': border_bufnr}, get(a:options, 'border_inited_execute', ''))
              call ${initExecute.name}({'bufnr': padding_bufnr}, get(a:options, 'padding_inited_execute', ''))
              return [bufnr, border_bufnr, padding_bufnr]
            endfunction
          `
        : `
            function! ${name}(options) abort
              let name = get(a:options, 'name', '')
              let bufnr = ${bufModule.create.name}(name)
              call ${initExecute.name}({'bufnr': bufnr}, get(a:options, 'inited_execute', ''))
              return [bufnr, v:null]
            endfunction
          `,
    ),
    open: m.fn<[number, floatingModule.OpenOptions], [number, number | null]>(
      'open',
      ({ name }) =>
        isNvim
          ? `
            function! ${name}(bufnr, options) abort
              let win_config = ${nvimWinConfig.name}(a:options, 'win')
              let border_winid = v:null
              let padding_winid = v:null
              let focus = get(a:options, 'focus', v:true)
              let border_bufnr = get(a:options, 'border_bufnr', v:null)
              let padding_bufnr = get(a:options, 'padding_bufnr', v:null)

              if has_key(a:options, 'border') && border_bufnr isnot v:null
                let border_win_config = ${nvimWinConfig.name}(a:options, 'border')
                call ${nvimBorderRender.name}(border_bufnr, a:options, border_win_config)
                let border_winid = nvim_open_win(border_bufnr, v:false, border_win_config)
                call ${nvimWinhl.name}(border_winid, get(a:options, 'border_winhl', v:null), get(a:options, 'border_winhlNC', v:null))
                call ${initExecute.name}({'bufnr': border_bufnr, 'winid': border_winid}, get(a:options, 'border_inited_execute', ''))
                call setbufvar(border_bufnr, '&filetype', 'coc-helper-border')
              endif

              if has_key(a:options, 'padding') && padding_bufnr isnot v:null
                let padding_win_config = ${nvimWinConfig.name}(a:options, 'padding')
                let padding_winid = nvim_open_win(padding_bufnr, v:true, padding_win_config)
                call ${nvimWinhl.name}(padding_winid, get(a:options, 'winhl', v:null), get(a:options, 'winhlNC', v:null))
                call ${initExecute.name}({'bufnr': padding_bufnr, 'winid': padding_winid}, get(a:options, 'padding_inited_execute', ''))
                call setbufvar(padding_bufnr, '&filetype', 'coc-helper-padding')
              endif

              let winid = nvim_open_win(a:bufnr, focus, win_config)
              call ${nvimWinhl.name}(winid, get(a:options, 'winhl', v:null), get(a:options, 'winhlNC', v:null))
              call ${initExecute.name}({'bufnr': a:bufnr, 'winid': winid}, get(a:options, 'inited_execute', ''))

              if has_key(a:options, 'filetype')
                call setbufvar(a:bufnr, '&filetype', a:options.filetype)
              endif

              return [winid, border_winid]
            endfunction
          `
          : `
            function! ${name}(bufnr, options) abort
              let win_config = ${vimWinConfig.name}(a:options)
              let winid = popup_create(a:bufnr, win_config)
              call ${initExecute.name}({'bufnr': a:bufnr}, get(a:options, 'inited_execute', ''))
              let filetype = get(a:options, 'filetype', v:null)
              if filetype != v:null
                call setbufvar(a:bufnr, '&filetype', filetype)
              endif
              return [winid, v:null]
            endfunction
          `,
    ),
    resume: m.fn<[number, floatingModule.OpenOptions], [number, number]>(
      'resume',
      ({ name }) =>
        isNvim
          ? `
            function! ${name}(bufnr, options) abort
              let win_config = ${nvimWinConfig.name}(a:options, 'win')
              let border_bufnr = get(a:options, 'border_bufnr', v:null)
              let border_winid = v:null
              if has_key(a:options, 'border') && border_bufnr isnot v:null
                let border_win_config = ${nvimWinConfig.name}(a:options, 'border')
                call ${nvimBorderRender.name}(border_bufnr, a:options, border_win_config)
                let border_winid = nvim_open_win(border_bufnr, v:false, border_win_config)
              endif
              let winid = nvim_open_win(a:bufnr, v:true, win_config)
              return [winid, border_winid]
            endfunction
          `
          : `
            function! ${name}(bufnr, options) abort
              " TODO
            endfunction
          `,
    ),
    resize: m.fn<[number, floatingModule.OpenOptions], [number, number]>(
      'resize',
      ({ name }) =>
        isNvim
          ? `
            function! ${name}(bufnr, options) abort
              let win_config = ${nvimWinConfig.name}(a:options, 'win')
              let border_bufnr = get(a:options, 'border_bufnr', v:null)
              let border_winid = v:null
              if has_key(a:options, 'border') && border_bufnr isnot v:null
                let border_winid = bufwinid(border_bufnr)
                let border_win_config = ${nvimWinConfig.name}(a:options, 'border')
                call ${nvimBorderRender.name}(border_bufnr, a:options, border_win_config)
                call nvim_win_set_config(border_winid, border_win_config)
              endif
              let winid = bufwinid(a:bufnr)
              call nvim_win_set_config(winid, win_config)
              return [winid, border_winid]
            endfunction
          `
          : `
            function! ${name}(bufnr, options) abort
              " TODO
            endfunction
          `,
    ),
  };
});
