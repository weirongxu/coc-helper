import { workspace } from 'coc.nvim';
import type { FloatingUtil } from '../FloatingUtil';
import { VimModule } from '../VimModule';
import { bufModule } from './buf';

/**
 * @deprecated Because VimModule deprecated
 */
export const floatingModule = VimModule.create('float', (m) => {
  type VimWinConfig = FloatingUtil.VimWinConfig;
  type NvimWinConfig = FloatingUtil.NvimWinConfig;
  const isNvim = workspace.isNvim;

  const initExecute = m.fn<[ctx: object, initedExecute: string], void>(
    'init_execute',
    ({ name }) => `
      function! ${name}(ctx, inited_execute) abort
        execute a:inited_execute
      endfunction
    `,
  );

  const openWin = m.fn<
    [
      bufnr: number,
      focus: boolean,
      winConfig: NvimWinConfig | VimWinConfig,
      winHl: string,
      initedExecute: string,
    ],
    number
  >('open_win', ({ name }) =>
    isNvim
      ? `
        function! ${name}(bufnr, focus, win_config, win_hl, inited_execute) abort
          noau let winid = nvim_open_win(a:bufnr, a:focus, a:win_config)
          if !empty(a:win_hl)
            call nvim_win_set_option(winid, 'winhl', a:win_hl)
          endif
          if !empty(a:inited_execute)
            call ${initExecute.inlineCall(
              "{'bufnr': a:bufnr, 'winid': winid}, a:inited_execute",
            )}
          endif
          return winid
        endfunction
      `
      : `
        function! ${name}(bufnr, focus, win_config, win_hl, inited_execute) abort
          let winid = popup_create(a:bufnr, a:win_config)
          call ${initExecute.inlineCall(
            "{'bufnr': a:bufnr, 'winid': winid}, a:inited_execute",
          )}

          return winid
        endfunction
      `,
  );

  return {
    create: m.fn<
      [
        name: string,
        initedExecute: string,
        hasBorderBuf: boolean,
        borderInitedExecute: string,
      ],
      [bufnr: number, borderBufnr: number | null]
    >('create', ({ name }) =>
      isNvim
        ? `
            function! ${name}(name, inited_execute, has_border_buf, border_inited_execute) abort
              let bufnr = ${bufModule.create.inlineCall('a:name')}
              call ${initExecute.inlineCall(
                "{'bufnr': bufnr}, a:inited_execute",
              )}

              let border_bufnr = v:null
              if a:has_border_buf
                let border_bufnr = nvim_create_buf(v:false, v:true)
                call ${initExecute.inlineCall(
                  "{'bufnr': border_bufnr}, a:border_inited_execute",
                )}
              endif
              return [bufnr, border_bufnr]
            endfunction
          `
        : `
            function! ${name}(name, inited_execute, has_border_buf, border_inited_execute) abort
              let bufnr = ${bufModule.create.inlineCall('a:name')}
              call ${initExecute.inlineCall(
                "{'bufnr': bufnr}, a:inited_execute",
              )}
              return [bufnr, v:null]
            endfunction
          `,
    ),
    open: m.fn<
      [
        bufnr: number,
        winConfig: NvimWinConfig | VimWinConfig,
        initedExecute: string,
        borderBufnr: number | null,
        borderWinConfig: NvimWinConfig | VimWinConfig | null,
        borderInitedExecute: string,
        focus: boolean,
        winHl: string,
      ],
      void
    >(
      'open',
      ({ name }) => `
        function! ${name}(bufnr, win_config, inited_execute, border_bufnr, border_win_config, border_inited_execute, focus, win_hl) abort
          let winid = ${openWin.inlineCall(
            'a:bufnr, a:focus, a:win_config, a:win_hl, a:inited_execute',
          )}
          call setbufvar(a:bufnr, 'coc_helper_winid', winid)

          if a:border_bufnr
            let border_winid = ${openWin.inlineCall(
              'a:border_bufnr, v:false, a:border_win_config, a:win_hl, a:border_inited_execute',
            )}
            call setbufvar(a:bufnr, 'coc_helper_border_winid', border_winid)
          endif
        endfunction
      `,
    ),
    resume: m.fn<
      [
        bufnr: number,
        winConfig: NvimWinConfig | VimWinConfig,
        borderBufnr: number | null,
        borderWinConfig: NvimWinConfig | VimWinConfig | null,
        focus: boolean,
        winHl: string,
      ],
      void
    >(
      'resume',
      ({ name }) => `
        function! ${name}(bufnr, win_config, border_bufnr, border_win_config, focus, win_hl) abort
          let winid = ${openWin.inlineCall(
            "a:bufnr, a:focus, a:win_config, a:win_hl, ''",
          )}
          call setbufvar(a:bufnr, 'coc_helper_winid', winid)

          if a:border_bufnr
            let border_winid = ${openWin.inlineCall(
              "border_bufnr, v:false, a:border_win_config, a:win_hl, ''",
            )}
            call setbufvar(a:bufnr, 'coc_helper_border_winid', border_winid)
          endif
        endfunction
      `,
    ),
    update: m.fn<
      [
        bufnr: number,
        winConfig: NvimWinConfig | VimWinConfig,
        borderBufnr: number | null,
        borderWinConfig: NvimWinConfig | VimWinConfig | null,
        winHl: string,
      ],
      void
    >('update', ({ name }) =>
      isNvim
        ? `
          function! ${name}(bufnr, win_config, border_bufnr, border_win_config, win_hl) abort
            let winid = getbufvar(a:bufnr, 'coc_helper_winid', v:null)
            if !winid
              return
            endif
            call nvim_win_set_config(winid, a:win_config)
            if !empty(a:win_hl)
              call nvim_win_set_option(winid, 'winhl', a:win_hl)
            endif
            if has('nvim')
              redraw!
            endif

            if a:border_bufnr
              let border_winid = getbufvar(a:bufnr, 'coc_helper_border_winid', v:null)
              if border_winid
                call nvim_win_set_config(border_winid, a:border_win_config)
                if !empty(a:win_hl)
                  call nvim_win_set_option(border_winid, 'winhl', a:win_hl)
                endif
                if has('nvim')
                  redraw!
                endif
              endif
            endif
          endfunction
        `
        : `
          function! ${name}(bufnr, win_config, border_bufnr, border_win_config, win_hl) abort
            let winid = getbufvar(a:bufnr, 'coc_helper_winid', v:null)
            if !winid
              return
            endif
            call popup_setoptions(winid, a:win_config)
          endfunction
        `,
    ),
    winid: m.fn<[bufnr: number], number | null>(
      'winid',
      ({ name }) => `
        function! ${name}(bufnr) abort
          let id = getbufvar(a:bufnr, 'coc_helper_winid', v:null)
          let nr = win_id2win(id)
          return nr is 0 ? v:null : id
        endfunction
      `,
    ),
    borderWinid: m.fn<[bufnr: number], number | null>(
      'border_winid',
      ({ name }) => `
        function! ${name}(bufnr) abort
          return getbufvar(a:bufnr, 'coc_helper_border_winid', v:null)
        endfunction
      `,
    ),
    close: m.fn<[bufnr: number], void>('close', ({ name }) =>
      isNvim
        ? `
            function! ${name}(bufnr) abort
              let winid = getbufvar(a:bufnr, 'coc_helper_winid', v:null)
              let border_winid = getbufvar(a:bufnr, 'coc_helper_border_winid', v:null)
              try
                if winid
                  call nvim_win_close(winid, v:true)
                endif
                if border_winid
                  call nvim_win_close(border_winid, v:true)
                endif
              catch
              endtry
            endfunction
          `
        : `
            function! ${name}(bufnr) abort
              let winid = getbufvar(a:bufnr, 'coc_helper_winid', v:null)
              try
                if winid
                  call popup_close(winid)
                endif
              catch
              endtry
            endfunction
          `,
    ),
  };
});
