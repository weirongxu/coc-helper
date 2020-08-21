import { ExtensionContext, commands, workspace } from 'coc.nvim';
export * from './VimModule';
export * from './modules/buf';
export * from './modules/util';
export * from './modules/floating';
export * from './FloatingWindow';
export * from './notifier';
export * from './util';

import { VimModule } from './VimModule';
import { FloatingWindow } from './FloatingWindow';
import { sleep } from './util';

export async function activateHelper(context: ExtensionContext) {
  await VimModule.init();
}

/**
 * Test
 */
export async function activate(context: ExtensionContext) {
  await activateHelper(context);

  await workspace.nvim.command('hi WinHL guibg=#aa0000');
  await workspace.nvim.command('hi WinHLB guibg=#0000aa');

  commands.registerCommand('testHelper', async () => {
    const floatWin = await FloatingWindow.create({
      mode: 'base',
    });
    await floatWin.open({
      relative: 'cursor-around',
      top: 0,
      left: 0,
      title: 'test',
      width: 5,
      height: 5,
      border: [],
      // padding: [],
      modifiable: true,
      winhl: 'WinHL',
      border_winhl: 'WinHLB',
      focus: false,
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
      // padding: [],
      modifiable: true,
      winhl: 'WinHL',
      border_winhl: 'WinHLB',
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
      border: [],
      // padding: [],
      modifiable: true,
      winhl: 'WinHL',
      border_winhl: 'WinHLB',
      focus: false,
      filetype: 'test',
    });
  });
}
