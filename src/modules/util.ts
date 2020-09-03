import { VimModule } from '../VimModule';
import { workspace } from 'coc.nvim';
import { FloatingUtil } from '../FloatingUtil';

export const utilModule = VimModule.create('util', (m) => {
  const isNvim = workspace.isNvim;

  return {
    globalCursorPosition: m.fn<[], FloatingUtil.Position>(
      'global_cursor_position',
      ({ name }) => `
        function! ${name}()
          let nr = winnr()
          let [row, col] = win_screenpos(nr)
          return [row + winline() - 2, col + wincol() - 2]
        endfunction
      `,
    ),
    isFloat: m.fn<[number], boolean>('is_float', ({ name }) =>
      isNvim
        ? `
          function! ${name}(winnr) abort
            if !exists('*nvim_win_get_config')
              return v:false
            endif
            let winid = win_getid(a:winnr)
            return nvim_win_get_config(winid)['relative'] != ''
          endfunction
        `
        : `
          function! ${name}(winnr) abort
            return v:false
          endfunction
        `,
    ),
    closeWinByBufnr: m.fn<[number[]], void>(
      'close_win_by_bufnr',
      ({ name }) => `
        if exists('*nvim_win_close')
          function! ${name}(bufnrs) abort
            for bufnr in a:bufnrs
              try
                let winid = bufwinid(bufnr)
                if winid >= 0
                  call nvim_win_close(winid, v:true)
                endif
              catch
              endtry
            endfor
          endfunction
        else
          function! ${name}(bufnrs) abort
            for bufnr in a:bufnrs
              try
                let winnr = bufwinnr(bufnr)
                if winnr >= 0
                  execute winnr . 'wincmd c'
                endif
              catch
              endtry
            endfor
          endfunction
        endif
      `,
    ),
    runCocCmd: m.fn<[name: string, ...args: unknown[]], unknown>(
      'run_coc_cmd',
      ({ name }) => `
      function! ${name}(name, ...) abort
        return call('CocAction', extend(['runCommand', a:name], a:000))
      endfunction
    `,
    ),
    runCocCmdAsync: m.fn<[name: string, ...args: unknown[]], unknown>(
      'run_coc_cmd_async',
      ({ name }) => `
      function! ${name}(name, ...) abort
        return call('CocActionAsync', extend(['runCommand', a:name], a:000))
      endfunction
    `,
    ),
  };
});
