" Syntax highlighting for OneShot. Mirrors the VS Code grammar in
" vscode-oneshot/syntaxes/oneshot.tmLanguage.json.
if exists("b:current_syntax")
  finish
endif

syn case match

" Every identifier is a variable unless something more specific matches
syn match oneshotVariable "\<\h\w*\>"
syn match oneshotFunctionCall "\<\h\w*\ze\s*("

syn keyword oneshotConditional IF ELSE THEN END
syn keyword oneshotRepeat FOR WHILE
syn keyword oneshotReturn RETURN
syn keyword oneshotImport IMPORT nextgroup=oneshotLibrary skipwhite
syn match oneshotLibrary "\h\w*" contained
syn keyword oneshotLogical AND OR
syn keyword oneshotLet LET
syn keyword oneshotFunc FUNC nextgroup=oneshotFunctionName skipwhite
syn match oneshotFunctionName "\h\w*" contained
syn keyword oneshotBoolean TRUE FALSE
syn keyword oneshotNull NULL

" Blocks that define sprites and songs
syn keyword oneshotBlock SPRITE FRAME SONG SHEET

" Statements that take comma-separated arguments
syn keyword oneshotCommand PRINT DEBUG SLEEP WINDOW COLOR FILL TEXT DRAW SIZE COLORDATA PIXELDATA BAR GAIN TYPE BPM LOOP PLAY STOP

syn keyword oneshotBuiltin RANDOM INPUT INT FLOOR CEIL SQRT LEN
syn keyword oneshotBuiltinValue MOUSEX MOUSEY ALL

syn match oneshotNumber "\<\d\+\%(\.\d\+\)\=\>"
syn match oneshotOperator "++\|--\|==\|<>\|<=\|>=\|[<>=!+\-*/%]"
syn match oneshotDelimiter "[,:()\[\]]"

" Strings have no escape sequences and may span lines
syn region oneshotString start=+"+ end=+"+
syn match oneshotComment "#.*$" contains=oneshotTodo,@Spell
syn keyword oneshotTodo TODO FIXME NOTE contained

hi def link oneshotVariable @variable
hi def link oneshotFunctionCall @function.call
hi def link oneshotConditional @keyword.conditional
hi def link oneshotRepeat @keyword.repeat
hi def link oneshotReturn @keyword.return
hi def link oneshotImport @keyword.import
hi def link oneshotLibrary @module
hi def link oneshotLogical @keyword.operator
hi def link oneshotLet @keyword
hi def link oneshotFunc @keyword.function
hi def link oneshotFunctionName @function
hi def link oneshotBoolean @boolean
hi def link oneshotNull @constant.builtin
hi def link oneshotBlock @type
hi def link oneshotCommand @keyword.directive
hi def link oneshotBuiltin @function.builtin
hi def link oneshotBuiltinValue @variable.builtin
hi def link oneshotNumber @number
hi def link oneshotOperator @operator
hi def link oneshotDelimiter @punctuation.delimiter
hi def link oneshotString @string
hi def link oneshotComment @comment
hi def link oneshotTodo @comment.todo

let b:current_syntax = "oneshot"
