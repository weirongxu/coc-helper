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
      relative: 'center',
      top: 0,
      left: 0,
      title: 'test',
      width: 30,
      height: 1,
      border: [],
      padding: [],
      modifiable: true,
      winhl: 'WinHL',
      border_winhl: 'WinHLB',
      focus: true,
      filetype: 'test',
      inited_execute: (ctx) => `
        call feedkeys('A')
      `,
    });
  });
}
