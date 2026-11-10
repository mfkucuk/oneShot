# OneShot for Neovim

Language support for [OneShot](https://github.com/mfkucuk/oneShot) `.oneshot` files in Neovim 0.11+:

- **Syntax highlighting** that matches the VS Code extension, using Tree-sitter highlight groups (`@keyword`, `@function.builtin`, …) so any modern color scheme works.
- **Completion** for keywords, commands, built-in functions and snippets, and for the functions and variables the file declares or imports with `IMPORT`. Inside strings it suggests sprite and frame names for `DRAW`, songs for `PLAY` / `STOP`, keys for `INPUT`, colors for `COLOR` / `COLORDATA` and wave types for `TYPE`. After `IMPORT` it suggests the libraries in `lib/`.
- **Hover documentation** for built-in words, your own functions and variables, and library functions. Library functions show the `#` comment above them.
- **Indentation** and `gc` commenting.

Completion and hover come from a small language server that runs inside Neovim, written in Lua with no external program. Any completion plugin that reads from LSP shows the suggestions (blink.cmp, nvim-cmp, or the built-in `vim.lsp.completion`), and `vim.lsp.buf.hover()` (`K`) shows the documentation.

Running programs is not included. Use the playground or the VS Code extension for that.

## Install

With [lazy.nvim](https://github.com/folke/lazy.nvim), from a clone of the repository:

```lua
{ dir = "path/to/oneShot/nvim-oneshot", name = "oneshot.nvim", lazy = false }
```

Without a plugin manager, add the folder to the runtime path:

```lua
vim.opt.rtp:append("path/to/oneShot/nvim-oneshot")
```

## Options

The libraries are read from the `lib` folder of the repository the plugin is in. To use another folder:

```lua
require("oneshot").setup({ lib_path = "path/to/lib" })
```

## Files

| File | What it does |
| --- | --- |
| `ftdetect/oneshot.lua` | Gives `.oneshot` files the `oneshot` filetype |
| `syntax/oneshot.vim` | Syntax highlighting |
| `indent/oneshot.vim` | Indentation |
| `ftplugin/oneshot.lua` | Comment settings, and starts the language server |
| `lua/oneshot/language.lua` | The built-in words with their documentation, and the document scanner. A port of `vscode-oneshot/src/language.js`, keep the two in sync |
| `lua/oneshot/init.lua` | The language server: completion and hover |
