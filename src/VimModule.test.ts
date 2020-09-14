import { jestHelper } from './JestHelper';
import { helperOnError } from './util';
import { VimModule } from './VimModule';

const fnTest = VimModule.create('fn_test', (m) => {
  return {
    test: m.fn<[string], string>(
      'test',
      ({ name }) => `
        function! ${name}(arg) abort
          return a:arg
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
  await VimModule.init().catch(helperOnError);
});

test('fn', async () => {
  const result = await fnTest.test.call('arg');
  expect(result).toBe('arg');
});

test('var', async () => {
  const result = await varTest.val.get();
  expect(result.isNvim).toBe(1);
});
