import type { ExtensionContext } from 'coc.nvim';
import { commands, events, window, workspace } from 'coc.nvim';
import { FloatingWindow } from './FloatingWindow';
import { MultiFloatingWindow } from './MultiFloatingWindow';
import { displayHeight, helperLogger, sleep } from './util';
import { VimModule } from './VimModule';
export * from './events';
export * from './FloatingWindow';
export * from './modules/buf';
export * from './modules/floating';
export * from './modules/util';
export * from './MultiFloatingWindow';
export * from './notifier';
export * from './util';
export * from './VimModule';
export * from './WinLayoutFinder';

export async function activateHelper(
  context: ExtensionContext,
  options: {
    /**
     * activate VimModule
     * @default true
     */
    vimModule?: boolean;
  } = {},
) {
  if (options.vimModule ?? true) {
    await VimModule.init(context);
  }
  try {
    await workspace.nvim.command(
      'hi default link CocHelperNormalFloatNC CocHelperNormalFloat',
    );
  } catch (error) {
    void window.showErrorMessage((error as Error).toString());
  }
}

/**
 * Test
 */
export async function activate(context: ExtensionContext) {
  await activateHelper(context);

  await helperLogger.measureTask(async () => {
    await workspace.nvim.command(
      'hi CocHelperNormalFloat ctermbg=Red guibg=#aa0000',
    );
    await workspace.nvim.command(
      'hi CocHelperNormalFloatNC ctermbg=Red guibg=#aa0000',
    );
    await workspace.nvim.command(
      'hi CocHelperNormalFloatBorder ctermbg=Black ctermfg=Grey guibg=#0000aa guifg=#ffffff',
    );
  }, 'highlight commands');

  await helperLogger.measureTask(async () => {
    const floatWin = await FloatingWindow.create({
      mode: 'base',
    });
    commands.registerCommand(
      'testHelper-floating',
      helperLogger.asyncCatch(async () => {
        const text = 'hello';
        await floatWin.open({
          relative: 'cursor-around',
          lines: [text],
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
          highlights: [
            {
              line: 0,
              srcId: 0,
              colStart: 0,
              colEnd: text.length,
              hlGroup: 'Question',
            },
          ],
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
          winHl: 'Pmenu',
          winHlNC: 'Pmenu',
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
      }),
    );
  }, 'register floatWin');

  await helperLogger.measureTask(async () => {
    const multiFloatWin = await MultiFloatingWindow.create({
      wins: {
        prompt: { mode: 'show' },
        input: { mode: 'base' },
      },
    });
    commands.registerCommand(
      'testHelper-multi-floating',
      helperLogger.asyncCatch(async () => {
        const width = 10;
        const promptText = 'input your path:';
        const promptHeight = await displayHeight(width, [promptText]);
        const inputText = '/home/users/repos';
        let inputHeight = await displayHeight(width, [inputText]);
        events.on('TextChangedI', async (bufnr) => {
          const floatWin = multiFloatWin.floatWinDict.input;
          if (floatWin.bufnr !== bufnr) {
            return;
          }
          const win = await floatWin.win();
          if (!win) {
            return;
          }
          const cursor = await win.cursor;
          const width = await win.width;
          const height = await win.height;
          const lines = await floatWin.buffer.getLines();
          const newHeight = await displayHeight(width, lines, cursor, 'i');
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
          // width,
          // height: promptHeight + inputHeight,
          border: [],
          padding: [],
          modifiable: true,
          filetype: 'test',
          wins: {
            prompt: {
              top: 0,
              left: 0,
              width,
              height: promptHeight,
              highlights: [
                {
                  line: 0,
                  srcId: 0,
                  colEnd: promptText.length,
                  colStart: 0,
                  hlGroup: 'Question',
                },
              ],
              lines: [promptText],
            },
            input: {
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
          },
        });

        const resize = async () => {
          await multiFloatWin.resize(getOptions());
        };
        await multiFloatWin.open(getOptions());
      }),
    );
  }, 'register multiFloatWin');
}
