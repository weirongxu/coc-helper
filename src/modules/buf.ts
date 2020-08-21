import { VimModule } from '../VimModule';
import { workspace } from 'coc.nvim';

const isNvim = workspace.isNvim;

export const bufModule = VimModule.create('buf', (m) => {
  const createByName = m.fn<[string], number>(
    'create_by_name',
    ({ name }) => `
      function! ${name}(name) abort
        return bufadd(a:name)
      endfunction
    `,
  );

  return {
    createByName,
    create: m.fn('create', ({ name }) =>
      isNvim
        ? `
          function! ${name}(...) abort
            let name = get(a:000, 0, '')
            if name is ''
              return nvim_create_buf(v:false, v:true)
            else
              return ${createByName.inlineCall('name')}
            endif
          endfunction
        `
        : `
          function! ${name}(...) abort
            let name = get(a:000, 0, '')
            return ${createByName.inlineCall('name')}
          endfunction
        `,
    ),
  };
});
