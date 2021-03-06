import { jestHelper } from './jest/JestHelper';
import { helperLogger } from './util';
import { VimModule } from './VimModule';

const fnTest = VimModule.create('fn_test', (m) => {
  return {
    test: m.fn<[string], string>(
      'test',
      ({ name }) => `
        function! ${name}(arg) abort
          let a = {
            \\ 'arg': a:arg
            \\ }
          return a.arg
        endfunction
      `,
    ),
  };
});

const varTest = VimModule.create('var_test', (m) => {
  return {
    val: m.var<{ isNvim: boolean }>('val', "{'isNvim': has('nvim')}"),
  };
});

jestHelper.boot();

beforeAll(async () => {
  await VimModule.init({
    logger: null as any,
    globalState: null as any,
    storagePath: '',
    extensionPath: '',
    subscriptions: [],
    asAbsolutePath: () => '',
    workspaceState: null as any,
  }).catch(helperLogger.error);
});

test('fn', async () => {
  const result = await fnTest.test.call('arg');
  expect(result).toBe('arg');
});

test('var', async () => {
  const result = await varTest.val.get();
  expect(result.isNvim).toBe(1);
});
