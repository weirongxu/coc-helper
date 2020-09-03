import { ExtensionContext, commands, workspace, events } from 'coc.nvim';
export * from './VimModule';
export * from './modules/buf';
export * from './modules/util';
export * from './modules/floating';
export * from './FloatingWindow';
export * from './MultiFloatingWindow';
export * from './notifier';
export * from './util';
export * from './JestHelper';

import { VimModule } from './VimModule';
import { FloatingWindow } from './FloatingWindow';
import { displayHeight, sleep } from './util';
import { MultiFloatingWindow } from './MultiFloatingWindow';

export async function activateHelper(context: ExtensionContext) {
  await VimModule.init();
  try {
    await workspace.nvim.command(
      'hi default link CocHelperNormalFloatNC CocHelperNormalFloat',
    );
  } catch (error) {
    // eslint-disable-next-line no-restricted-properties
    workspace.showMessage(error, 'error');
  }
}

/**
 * Test
 */
export async function activate(context: ExtensionContext) {
  await activateHelper(context);

  await workspace.nvim.command(
    'hi CocHelperNormalFloat ctermbg=Red guibg=#aa0000',
  );
  await workspace.nvim.command(
    'hi CocHelperNormalFloatNC ctermbg=Red guibg=#aa0000',
  );
  await workspace.nvim.command(
    'hi CocHelperNormalFloatBorder ctermbg=Black ctermfg=Grey guibg=#0000aa guifg=#ffffff',
  );

  const floatWin = await FloatingWindow.create({
    mode: 'base',
  });
  commands.registerCommand('testHelper-floating', async () => {
    await floatWin.open({
      relative: 'cursor-around',
      lines: ['hello'],
      top: 0,
      left: 0,
      title: 'test',
      width: 5,
      height: 5,
      border: [1, 1, 1, 0],
      padding: [],
      modifiable: true,
      focus: true,
      filetype: 'test',
    });
    await sleep(2000);
    await floatWin.resize({
      relative: 'cursor-around',
      top: 0,
      left: 0,
      title: 'test',
      width: 10,
      height: 10,
      border: [],
      padding: [],
      modifiable: true,
      focus: false,
      filetype: 'test',
    });
    await sleep(2000);
    await floatWin.resize({
      relative: 'cursor-around',
      top: 0,
      left: 0,
      title: 'test',
      width: 5,
      height: 5,
      border: [1, 1, 1, 0],
      padding: [],
      modifiable: true,
      focus: false,
      filetype: 'test',
    });
  });

  const multiFloatWin = await MultiFloatingWindow.create({
    wins: [{ mode: 'show' }, { mode: 'base' }],
  });
  commands.registerCommand('testHelper-multi-floating', async () => {
    const width = 10;
    const promptText = 'input your path:';
    const promptHeight = await displayHeight(width, [promptText]);
    const inputText = '/home/users/repos';
    let inputHeight = await displayHeight(width, [inputText]);
    events.on('TextChanged', async (bufnr) => {
      if (multiFloatWin.floatWins[1].bufnr !== bufnr) {
        return;
      }
      const floatWin = multiFloatWin.floatWins[1];
      const win = await floatWin.win();
      if (!win) {
        return;
      }
      const cursor = await win.cursor;
      const width = await win.width;
      const height = await win.height;
      const lines = await floatWin.buffer.getLines();
      const newHeight = await displayHeight(width, lines, cursor);
      if (newHeight !== height) {
        inputHeight = newHeight;
        await resize();
      }
    });
    const getOptions = (): MultiFloatingWindow.OpenOptions => ({
      relative: 'cursor-around',
      top: 0,
      left: 0,
      title: 'test',
      width,
      height: promptHeight + inputHeight,
      border: [],
      padding: [],
      modifiable: true,
      filetype: 'test',
      wins: [
        {
          top: 0,
          left: 0,
          width,
          height: promptHeight,
          lines: [promptText],
        },
        {
          top: promptHeight,
          left: 0,
          width,
          height: inputHeight,
          lines: [inputText],
          focus: true,
          modifiable: true,
          initedExecute: () => `
            if has('nvim')
              call feedkeys('A')
            endif
          `,
        },
      ],
    });

    const resize = async () => {
      await multiFloatWin.resize(getOptions());
    };
    await multiFloatWin.open(getOptions());
  });
}
