import { workspace } from 'coc.nvim';
import { generateUri } from './text';

export const configLocal = (resource: string = generateUri(workspace.cwd)) =>
  workspace.getConfiguration('explorer', resource);
