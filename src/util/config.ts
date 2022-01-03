import { workspace } from 'coc.nvim';
import { generateUri } from './text';

export const getConfigLocal =
  (section: string) =>
  (resource: string = generateUri(workspace.cwd)) =>
    workspace.getConfiguration(section, resource);
