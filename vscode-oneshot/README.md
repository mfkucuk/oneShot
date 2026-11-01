# OneShot for Visual Studio Code

Language support for [OneShot](https://github.com/mfkucuk/oneShot) (`.oneshot` files).

## Features

### Run games inside VS Code
Press `F5`, or the ▶ button in the editor title bar, to run the file in a panel next to the editor. The panel has the canvas, the `PRINT` output and errors with their line numbers.
- Click the game to give it the keyboard.
- The file runs again whenever you save it (turn this off with the `oneshot.runOnSave` setting).
- `Shift+F5` or the **Stop** button stops it. The zoom setting makes small games bigger, with crisp pixels.

### Sprite & music preview
The preview button in the editor title bar opens a live preview of the file's sprites and songs. It updates as you type.
- **Sprites:** every frame, plus an animation that cycles through them at an adjustable speed.
- **Songs:** a piano roll with one color per sheet, and a **Play** button that shows a moving playhead. If you edit a song while it plays, it restarts with the new notes.

The preview evaluates `SPRITE` and `SONG` blocks with the real interpreter, so it shows exactly what the game will draw and play, and it reports errors such as a `PIXELDATA` row that is too wide.

### Completion and hovers
- Keywords, commands and built-in functions complete with their arguments as placeholders. `FOR`, `IF`, `WHILE`, `FUNC`, `SPRITE` and `SONG` complete to whole blocks, and there are `game loop` and `key press` snippets.
- Your own variables, arrays, functions and parameters complete too, and functions complete with their parameters.
- Inside strings, suggestions follow the command:
  - `DRAW x, y, "` suggests sprites, and the next string suggests that sprite's frames.
  - `PLAY "` and `STOP "` suggest songs.
  - `INPUT("` suggests key names.
  - `TYPE "` suggests wave types.
  - `COLOR "` and `COLORDATA` suggest colors.
- Hovering a keyword shows its documentation. Hovering your own functions and variables shows where they were declared.

### Editing
- Syntax highlighting.
- `Cmd+/` / `Ctrl+/` toggles `#` comments.
- `(`, `[` and `"` close automatically.
- Lines are indented after `THEN`, `ELSE`, `SPRITE`, `FRAME`, `SONG` and `SHEET`, and `END` and `ELSE` are outdented.

## Install
The extension needs no build step. Link this folder into your extensions folder, then restart VS Code:

```bash
ln -s "$(pwd)/vscode-oneshot" ~/.vscode/extensions/mfkucuk.oneshot-language-0.2.0
```

Linked like this, the extension uses the repository's own `oneShot.js`, so changes to the interpreter show up after **Developer: Reload Window**.

To share it as a `.vsix` file, package it, then use **Extensions › ⋯ › Install from VSIX...**:

```bash
cd vscode-oneshot && npx @vscode/vsce package
```

Packaging copies `../oneShot.js` into `media/`, because a packaged extension can't reach files outside its folder.

## Developing
Open this folder in VS Code and press `F5` to start a window with the extension loaded. **Developer: Inspect Editor Tokens and Scopes** shows which scope a piece of code gets, and **Developer: Open Webview Developer Tools** opens the developer tools for the run panel and the preview.

| File | What it does |
| --- | --- |
| `extension.js` | Registers the commands and providers, and keeps the panels up to date |
| `src/language.js` | Documentation for every keyword, and the scan for the names a file declares |
| `src/completion.js` | Completion and hovers |
| `src/panels.js` | The run panel and the preview, which are webviews that load `oneShot.js` |
| `media/run.js`, `media/preview.js` | The scripts that run inside those webviews |
| `syntaxes/oneshot.tmLanguage.json` | The highlighting grammar |

When a keyword is added to `KEYWORDS` in `oneShot.js`, add it to the grammar and to `src/language.js` too.
