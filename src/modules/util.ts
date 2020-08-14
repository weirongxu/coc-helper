import { VimModule } from '../VimModule';
import { workspace } from 'coc.nvim';

const isNvim = workspace.isNvim;

export const utilModule = VimModule.create('util', (m) => {
  return {
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
  };
});
