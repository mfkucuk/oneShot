" Indentation for OneShot, with the same rules as the VS Code extension:
" a line ending in THEN, and ELSE / SPRITE / FRAME / SONG / SHEET, indent the next line,
" and END / ELSE outdent themselves.
if exists("b:did_indent")
  finish
endif
let b:did_indent = 1

setlocal indentexpr=OneShotIndent(v:lnum)
setlocal indentkeys=0{,0},!^F,o,O,=END,=ELSE
setlocal autoindent

let b:undo_indent = "setlocal indentexpr< indentkeys< autoindent<"

if exists("*OneShotIndent")
  finish
endif

function! OneShotIndent(lnum) abort
  let previous = prevnonblank(a:lnum - 1)
  if previous == 0
    return 0
  endif

  let indent = indent(previous)
  let previousLine = getline(previous)

  if previousLine !~# '^\s*#' && (previousLine =~# '\<THEN\s*\%(#.*\)\=$' || previousLine =~# '^\s*\%(ELSE\|SPRITE\|FRAME\|SONG\|SHEET\)\>')
    let indent += shiftwidth()
  endif

  if getline(a:lnum) =~# '^\s*\%(END\|ELSE\)\>'
    let indent -= shiftwidth()
  endif

  return max([indent, 0])
endfunction
