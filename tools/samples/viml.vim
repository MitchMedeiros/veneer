" a small vimrc
set nocompatible
set number relativenumber
let mapleader = " "
let g:my_list = [1, 2, 3]

function! Greet(name) abort
  echo "Hello, " . a:name
  if a:name ==# 'world' && !empty(g:my_list)
    return 1
  endif
  return 0
endfunction

nnoremap <leader>g :call Greet('world')<CR>
autocmd BufWritePre *.py :%s/\s\+$//e
syntax on
colorscheme default
