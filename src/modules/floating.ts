import { BufferHighlight } from '@chemzqm/neovim';
import { workspace } from 'coc.nvim';
import { VimModule } from '../VimModule';
import { bufModule } from './buf';
import { utilModule } from './util';

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
    relative?: 'center' | 'cursor' | 'cursor-around' | 'win' | 'editor';
    width: number;
    height: number;
    /**
     * Vim only
     */
    max_width?: number;
    /**
     * Vim only
     */
    max_height?: number;
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
    border?: number[];
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
    /**
     * Neovim only
     */
    focus?: boolean;
    lines?: string[];
    highlights?: BufferHighlight[];
    modifiable?: boolean;
    winhl?: string;
    /**
     * Neovim only
     */
    winhlNC?: string;
    border_winhl?: string;
    border_winhlNC?: string;
    inited_execute?: string;
    border_inited_execute?: string;
    padding_inited_execute?: string;

    border_bufnr?: number;
    winid?: number;
    border_winid?: number;
    padding_winid?: number;
  }
}

const isNvim = workspace.isNvim;

export const floatingModule = VimModule.create('float', (m) => {
  type Edges = [top: number, right: number, down: number, left: number];
  type Box = [top: number, left: number, width: number, height: number];
  type Pos = [top: number, left: number];
  type Size = [width: number, height: number];

  const getCenterPos = m.fn<[box: Box], Pos>(
    'get_center_pos',
    ({ name }) => `
      function ${name}(box) abort
        let columns = &columns
        let lines = &lines - &cmdheight - 1
        let [_, _, width, height] = a:box
        let top = (lines - height) / 2
        let left = (columns - width) / 2
        return [top, left]
      endfunction
    `,
  );

  const getPosForAround = m.fn<[size: Size], Pos>(
    'get_pos_for_around',
    ({ name }) => `
      function! ${name}(size)
        let columns = &columns
        let lines = &lines - &cmdheight - 1
        let [top, left] = ${utilModule.globalCursorPosition.inlineCall()}
        let [width, height] = a:size
        if top + height >= lines
          let top -= height
        else
          let top += 1
        endif
        if left + width >= columns
          let left -= width - 1
        endif
        return [top, left]
      endfunction
    `,
  );

  /**
   * Extend around number to 4
   * @return [top, right, down, left]
   */
  const extendEdges: VimModule.FnCaller<number[], Edges> = m.fn<[any], any>(
    'extend_edges',
    ({ name }) => `
      function! ${name}(edges) abort
        let len = len(a:edges)
        let top = a:edges[0]
        let right = top
        if len >= 2
          let right = a:edges[1]
        endif
        let down = top
        if len >= 3
          let down = a:edges[2]
        endif
        let left = right
        if len >= 4
          let left = a:edges[3]
        endif
        return [top, right, down, left]
      endfunction
    `,
  );

  /**
   * Change window box by around edges
   * @argument [top, left, width, height], number[]
   * @return [top, left, width, height]
   */
  const changeBoxByEdges = m.fn<[box: Box, edges: number[]], Box>(
    'change_box_by_edges',
    ({ name }) => `
      function! ${name}(box, edges) abort
        if len(a:edges)
          let [w_top, w_right, w_down, w_left] = ${extendEdges.inlineCall(
            'a:edges',
          )}
        else
          let [w_top, w_right, w_down, w_left] = [1, 1, 1, 1]
        endif
        let [top, left, width, height] = a:box
        let top -= w_top
        let left -= w_left
        let width += w_left + w_right
        let height += w_top + w_down
        return [top, left, width, height]
      endfunction
    `,
  );

  const vimWinConfig = m.fn<
    [options: floatingModule.OpenOptions, update_pos?: boolean],
    {
      line: number;
      col: number;
      minwidth: number;
      minheight: number;
      highlight: string;
      padding?: number[];
      border?: number[];
      borderchars?: string[];
      close?: 'button' | 'click' | 'none';
      borderhighlight?: string;
    }
  >(
    'vim_win_config',
    ({ name }) => `
      function! ${name}(options, ...) abort
        let update_pos = get(a:, 1, v:true)
        let [top, left, width, height] = [a:options.top, a:options.left, a:options.width, a:options.height]
        if a:options.relative == 'center'
          let config = {
            \\ 'pos': 'center',
            \\ }
        elseif update_pos
          if a:options.relative == 'cursor-around'
            let box = [top, left, width, height]
            if has_key(a:options, 'padding')
              let box = ${changeBoxByEdges.inlineCall('box, a:options.padding')}
            endif
            if has_key(a:options, 'border')
              let box = ${changeBoxByEdges.inlineCall('box, a:options.border')}
            endif
            let [top, left] = ${getPosForAround.inlineCall('[box[2], box[3]]')}
            let a:options.relative = 'editor'
          endif
          if a:options.relative == 'cursor'
            if top >= 0
              let top = 'cursor+' . top
            else
              let top = 'cursor' . top
            endif
            if left >= 0
              let left = 'cursor+' . left
            else
              let left = 'cursor' . left
            endif
          else
            let top += 1
            let left += 1
          endif
          let config = {
                \\ 'line': top,
                \\ 'col': left,
                \\ }
        else
          let config = {}
        endif
        let config.minwidth = width
        let config.minheight = height
        if has_key(a:options, 'max_width')
          let config.maxwidth = a:options.max_width
        endif
        if has_key(a:options, 'max_height')
          let config.maxheight = a:options.max_height
        endif
        if has_key(a:options, 'winhl')
          let config.highlight = get(a:options, 'winhl')
        endif
        if has_key(a:options, 'title')
          let config.title = a:options.title
        endif
        if has_key(a:options, 'padding')
          let config.padding = a:options.padding
        endif
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

  type NvimWinConfig = {
    relative: string;
    row: number;
    col: number;
    width: number;
    height: number;
  };
  const nvimWinConfig = m.fn<
    [options: floatingModule.OpenOptions, update_pos?: boolean],
    {
      border: NvimWinConfig | null;
      padding: NvimWinConfig | null;
      content: NvimWinConfig;
    }
  >(
    'nvim_win_config',
    ({ name }) => `
      function! ${name}(options, ...) abort
        let update_pos = get(a:, 1, v:true)
        let title = get(a:options, 'title', '')
        let width = max([a:options.width, strdisplaywidth(title)])
        let full_box = [0, 0, width, a:options.height]
        let cont_box = copy(full_box)
        let pad_box = v:null
        let br_box = v:null
        if has_key(a:options, 'padding')
          let pad_box = ${changeBoxByEdges.inlineCall(
            'full_box, a:options.padding',
          )}
          let full_box = copy(pad_box)
        endif
        if has_key(a:options, 'border')
          let full_box = ${changeBoxByEdges.inlineCall(
            'full_box, a:options.border',
          )}
          let br_box = copy(full_box)
        endif

        if a:options.relative == 'center'
          if br_box isnot v:null
            let cur_pos = ${getCenterPos.inlineCall('br_box')}
          elseif pad_box isnot v:null
            let cur_pos = ${getCenterPos.inlineCall('pad_box')}
          else
            let cur_pos = ${getCenterPos.inlineCall('cont_box')}
          endif
        elseif update_pos
          if a:options.relative == 'cursor'
            let cur_pos = ${utilModule.globalCursorPosition.inlineCall()}
          elseif a:options.relative == 'cursor-around'
            let cur_pos = ${getPosForAround.inlineCall('[full_box[2], full_box[3]]')}
          else
            let cur_pos = [a:options.top, a:options.left]
          endif
        else
          if a:options.border_winid
            let cur_pos = nvim_win_get_position(a:options.border_winid)
          elseif a:options.padding_winid
            let cur_pos = nvim_win_get_position(a:options.padding_winid)
          elseif a:options.winid
            let cur_pos = nvim_win_get_position(a:options.winid)
          else
            let cur_pos = v:null
          endif
        end

        if cur_pos isnot v:null
          let [cont_box[0], cont_box[1]] = [cur_pos[0], cur_pos[1]]
          if br_box isnot v:null
            let cont_box[0] -= br_box[0]
            let cont_box[1] -= br_box[1]
            let br_box[0] = cur_pos[0]
            let br_box[1] = cur_pos[1]
            let cur_pos[0] = cont_box[0]
            let cur_pos[1] = cont_box[1]
          endif
          if pad_box isnot v:null
            let cont_box[0] -= pad_box[0]
            let cont_box[1] -= pad_box[1]
            let pad_box[0] = cur_pos[0]
            let pad_box[1] = cur_pos[1]
          endif
        endif

        let content = {
          \\ 'relative': 'editor',
          \\ 'width': cont_box[2],
          \\ 'height': cont_box[3],
          \\ 'focusable': v:true,
          \\ }
        if update_pos
          let content = extend(content, {
            \\ 'row': cont_box[0],
            \\ 'col': cont_box[1],
            \\ })
        endif
        if pad_box isnot v:null
          let padding = {
            \\ 'relative': 'editor',
            \\ 'width': pad_box[2],
            \\ 'height': pad_box[3],
            \\ 'focusable': v:false,
            \\ }
          if update_pos
            let padding = extend(padding, {
              \\ 'row': pad_box[0],
              \\ 'col': pad_box[1],
              \\ })
          endif
        else
          let padding = v:null
        endif
        if br_box isnot v:null
          let border = {
            \\ 'relative': 'editor',
            \\ 'width': br_box[2],
            \\ 'height': br_box[3],
            \\ 'focusable': v:false,
            \\ }
          if update_pos
            let border = extend(border, {
              \\ 'row': br_box[0],
              \\ 'col': br_box[1],
              \\ })
          endif
        else
          let border = v:null
        endif

        return {"content": content, "padding": padding, "border": border}
      endfunction
  `,
  );

  const nvimWinSetConfig = m.fn<
    [winid: number, nvim_win_config: object],
    void
  >('nvim_win_set_config', ({name}) => `
    function! ${name}(winid, nvim_win_config) abort
      let nvim_win_config = a:nvim_win_config
      let [cur_row, cur_col] = nvim_win_get_position(a:winid)
      let nvim_win_config.row = get(nvim_win_config, 'row', cur_row)
      let nvim_win_config.col = get(nvim_win_config, 'col', cur_col)
      call nvim_win_set_config(a:winid, nvim_win_config)
    endfunction
  `);

  const initExecute = m.fn<[ctx: object, inited_execute: string], void>(
    'init_execute',
    ({ name }) => `
      function! ${name}(ctx, inited_execute) abort
        execute a:inited_execute
      endfunction
    `,
  );

  const nvimBorderRender = m.fn<
    [bufnr: number, options: floatingModule.OpenOptions, win_options: NvimWinConfig],
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

  const nvimWinhl = m.fn<[winid: number, normal: string | null, normalNC: string | null], void>(
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
      [options: floatingModule.CreateOptions],
      [bufnr: number, border_bufnr: number | null, padding_bufnr: number | null]
    >('create', ({ name }) =>
      isNvim
        ? `
            function! ${name}(options) abort
              let name = get(a:options, 'name', '')
              let border_bufnr = nvim_create_buf(v:false, v:true)
              let padding_bufnr = nvim_create_buf(v:false, v:true)
              let bufnr = ${bufModule.create.inlineCall('name')}
              call ${initExecute.inlineCall(
                "{'bufnr': bufnr}, get(a:options, 'inited_execute', '')",
              )}
              call ${initExecute.inlineCall(
                "{'bufnr': border_bufnr}, get(a:options, 'border_inited_execute', '')",
              )}
              call ${initExecute.inlineCall(
                "{'bufnr': padding_bufnr}, get(a:options, 'padding_inited_execute', '')",
              )}
              return [bufnr, border_bufnr, padding_bufnr]
            endfunction
          `
        : `
            function! ${name}(options) abort
              let name = get(a:options, 'name', '')
              let bufnr = ${bufModule.create.inlineCall('name')}
              call ${initExecute.inlineCall(
                "{'bufnr': bufnr}, get(a:options, 'inited_execute', '')",
              )}
              return [bufnr, v:null, v:null]
            endfunction
          `,
    ),
    open: m.fn<
      [bufnr: number, options: floatingModule.OpenOptions],
      [winid: number, border_winid: number | null, padding_winid: number | null]
    >('open', ({ name }) =>
      isNvim
        ? `
            function! ${name}(bufnr, options) abort
              let win_config_dict = ${nvimWinConfig.inlineCall('a:options')}
              let border_winid = v:null
              let padding_winid = v:null
              let focus = get(a:options, 'focus', v:false)
              let border_bufnr = get(a:options, 'border_bufnr', v:null)
              let padding_bufnr = get(a:options, 'padding_bufnr', v:null)

              let winid = nvim_open_win(a:bufnr, focus, win_config_dict.content)
              call ${nvimWinhl.inlineCall(
                "winid, get(a:options, 'winhl', v:null), get(a:options, 'winhlNC', v:null)",
              )}
              call ${initExecute.inlineCall(
                "{'bufnr': a:bufnr, 'winid': winid}, get(a:options, 'inited_execute', '')",
              )}

              if win_config_dict.padding isnot v:null && padding_bufnr isnot v:null
                let padding_winid = nvim_open_win(padding_bufnr, v:true, win_config_dict.padding)
                call ${nvimWinhl.inlineCall(
                  "padding_winid, get(a:options, 'winhl', v:null), get(a:options, 'winhlNC', v:null)",
                )}
                call ${initExecute.inlineCall(
                  "{'bufnr': padding_bufnr, 'winid': padding_winid}, get(a:options, 'padding_inited_execute', '')",
                )}
                call setbufvar(padding_bufnr, '&filetype', 'coc-helper-padding')
              endif

              if win_config_dict.border isnot v:null && border_bufnr isnot v:null
                call ${nvimBorderRender.inlineCall(
                  'border_bufnr, a:options, win_config_dict.border',
                )}
                let border_winid = nvim_open_win(border_bufnr, v:false, win_config_dict.border)
                call ${nvimWinhl.inlineCall(
                  "border_winid, get(a:options, 'border_winhl', v:null), get(a:options, 'border_winhlNC', v:null)",
                )}
                call ${initExecute.inlineCall(
                  "{'bufnr': border_bufnr, 'winid': border_winid}, get(a:options, 'border_inited_execute', '')",
                )}
                call setbufvar(border_bufnr, '&filetype', 'coc-helper-border')
              endif

              if has_key(a:options, 'filetype')
                call setbufvar(a:bufnr, '&filetype', a:options.filetype)
              endif

              return [winid, border_winid, padding_winid]
            endfunction
          `
        : `
            function! ${name}(bufnr, options) abort
              let win_config = ${vimWinConfig.inlineCall('a:options')}
              let winid = popup_create(a:bufnr, win_config)
              call ${initExecute.inlineCall(
                "{'bufnr': a:bufnr}, get(a:options, 'inited_execute', '')",
              )}
              let filetype = get(a:options, 'filetype', v:null)
              if filetype != v:null
                call setbufvar(a:bufnr, '&filetype', filetype)
              endif
              return [winid, v:null, v:null]
            endfunction
          `,
    ),
    resume: m.fn<
      [bufnr: number, options: floatingModule.OpenOptions],
      [winid: number, border_winid: number | null, padding_winid: number | null]
    >('resume', ({ name }) =>
      isNvim
        ? `
            function! ${name}(bufnr, options) abort
              let win_config_dict = ${nvimWinConfig.inlineCall('a:options')}
              let border_bufnr = get(a:options, 'border_bufnr', v:null)
              let padding_bufnr = get(a:options, 'padding_bufnr', v:null)
              let border_winid = v:null
              let padding_winid = v:null

              let winid = nvim_open_win(a:bufnr, v:true, win_config_dict.content)

              if win_config_dict.padding isnot v:null && padding_bufnr isnot v:null
                let padding_winid = nvim_open_win(padding_bufnr, v:false, win_config_dict.padding)
              endif

              if win_config_dict.border isnot v:null && border_bufnr isnot v:null
                call ${nvimBorderRender.inlineCall(
                  'border_bufnr, a:options, win_config_dict.border',
                )}
                let border_winid = nvim_open_win(border_bufnr, v:false, win_config_dict.border)
              endif

              return [winid, border_winid, padding_winid]
            endfunction
          `
        : `
            function! ${name}(bufnr, options) abort
              let win_config = ${vimWinConfig.inlineCall('a:options')}
              let winid = popup_create(a:bufnr, win_config)
              return [winid, v:null, v:null]
            endfunction
          `,
    ),
    update: m.fn<
      [bufnr: number, options: floatingModule.OpenOptions],
      [winid: number, border_winid: number | null, padding_winid: number | null]
    >(
      'update',
      ({name}) =>
      isNvim
        ? `
            function! ${name}(bufnr, options) abort
              let win_config_dict = ${nvimWinConfig.inlineCall('a:options')}
              let border_bufnr = get(a:options, 'border_bufnr', v:null)
              let padding_bufnr = get(a:options, 'padding_bufnr', v:null)

              if has_key(a:options, 'winid')
                let winid = a:options.winid
              else
                let winid = bufwinid(a:bufnr)
              end
              let border_winid = get(a:options, 'border_winid', v:null)
              let padding_winid = get(a:options, 'padding_winid', v:null)

              if win_config_dict.border isnot v:null && border_bufnr isnot v:null
                let border_winid = bufwinid(border_bufnr)
                call ${nvimBorderRender.inlineCall(
                  'border_bufnr, a:options, win_config_dict.border',
                )}
                call ${nvimWinSetConfig.inlineCall('border_winid, win_config_dict.border')}
                redraw!
              endif

              if win_config_dict.padding isnot v:null && padding_bufnr isnot v:null
                let padding_winid = bufwinid(padding_bufnr)
                call ${nvimWinSetConfig.inlineCall('padding_winid, win_config_dict.padding')}
                redraw!
              endif

              call ${nvimWinSetConfig.inlineCall('winid, win_config_dict.content')}

              return [winid, border_winid, padding_winid]
            endfunction
          `
        : `
            function! ${name}(bufnr, options) abort
              if !has_key(a:options, 'winid')
                throw
              endif
              let win_config = ${vimWinConfig.inlineCall('a:options')}
              let winid = a:options.winid
              call popup_setoptions(winid, win_config)
              return [winid, v:null, v:null]
            endfunction
          `,
    ),
    resize: m.fn<
      [bufnr: number, options: floatingModule.OpenOptions],
      [winid: number, border_winid: number | null, padding_winid: number | null]
    >('resize', ({ name }) =>
      isNvim
        ? `
            function! ${name}(bufnr, options) abort
              let win_config_dict = ${nvimWinConfig.inlineCall('a:options, v:false')}
              let border_bufnr = get(a:options, 'border_bufnr', v:null)
              let padding_bufnr = get(a:options, 'padding_bufnr', v:null)

              if has_key(a:options, 'winid')
                let winid = a:options.winid
              else
                let winid = bufwinid(a:bufnr)
              end
              let border_winid = get(a:options, 'border_winid', v:null)
              let padding_winid = get(a:options, 'padding_winid', v:null)

              if win_config_dict.border isnot v:null && border_bufnr isnot v:null
                let border_winid = bufwinid(border_bufnr)
                call ${nvimBorderRender.inlineCall(
                  'border_bufnr, a:options, win_config_dict.border',
                )}
                call ${nvimWinSetConfig.inlineCall('border_winid, win_config_dict.border')}
                redraw!
              endif

              if win_config_dict.padding isnot v:null && padding_bufnr isnot v:null
                let padding_winid = bufwinid(padding_bufnr)
                call ${nvimWinSetConfig.inlineCall('padding_winid, win_config_dict.padding')}
                redraw!
              endif

              call ${nvimWinSetConfig.inlineCall('winid, win_config_dict.content')}

              return [winid, border_winid, padding_winid]
            endfunction
          `
        : `
            function! ${name}(bufnr, options) abort
              if !has_key(a:options, 'winid')
                throw
              endif
              let win_config = ${vimWinConfig.inlineCall('a:options, v:false')}
              let winid = a:options.winid
              call popup_setoptions(winid, win_config)
              return [winid, v:null, v:null]
            endfunction
          `,
    ),
  };
});
