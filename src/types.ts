declare module 'coc.nvim' {
  interface Neovim {
    /**
     * Executes an ex-command by notification.
     */
    command(arg: string, isNotify: true): void;
  }
}
