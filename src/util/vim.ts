import type { ExtensionContext } from 'coc.nvim';
import { workspace } from 'coc.nvim';

export async function registerRuntimepath(context: ExtensionContext) {
  const { nvim } = workspace;
  const extensionPath = context.extensionPath;
  const paths = await nvim.runtimePaths;
  if (!paths.includes(extensionPath)) {
    await nvim.command(
      `execute 'noa set rtp+='.fnameescape('${extensionPath.replace(
        /'/g,
        "''",
      )}')`,
    );
  }
}
