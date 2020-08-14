set nocompatible
set runtimepath^=../../coc.nvim

let g:node_client_debug = 1
let g:coc_node_args = ['--nolazy', '--async-stack-traces']
" let g:coc_node_args = ['--nolazy', '--inspect-brk=6045']
let g:coc_config_home = expand('<sfile>:h')
let g:coc_data_home = expand('<sfile>:h') . '/data_home'
let &runtimepath .= ',' . expand('<sfile>:h:h')

let mapleader = "\<Space>"
nmap <Leader>t :CocCommand testHelper<CR>

set hidden
set cmdheight=2
set termguicolors
set wildmenu
set ignorecase
set mouse+=a
filetype plugin indent on
syntax on
