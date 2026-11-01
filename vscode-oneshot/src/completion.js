// Completion and hover for OneShot

const vscode = require('vscode');
const { ENTRIES, ENTRIES_BY_NAME, SNIPPETS, KEY_NAMES, WAVE_TYPES, COLORS, scanDocument } = require('./language');

const ENTRY_KINDS = {
    keyword: vscode.CompletionItemKind.Keyword,
    block: vscode.CompletionItemKind.Struct,
    command: vscode.CompletionItemKind.Method,
    function: vscode.CompletionItemKind.Function,
    value: vscode.CompletionItemKind.Constant,
    constant: vscode.CompletionItemKind.Constant,
};

/**
 * Inside a string, what to suggest depends on the command the string belongs to.
 * Each pattern is matched against the text of the line before the cursor.
 */
const STRING_CONTEXTS = [
    {
        // DRAW x, y, "SPRITE", "| → the frames of that sprite
        pattern: /\bDRAW\s+[^,]*,[^,]*,\s*"([^"]*)"\s*,\s*"[^"]*$/,
        items: (scan, match) => {
            const sprite = scan.sprites.find(sprite => sprite.name === match[1]);
            return (sprite?.frames ?? [])
                .map((frame, index) => ({ label: frame, detail: `Frame ${index} of ${sprite.name}` }))
                .filter(item => item.label !== null);
        },
        kind: vscode.CompletionItemKind.EnumMember,
    },
    {
        // DRAW x, y, "| → sprites
        pattern: /\bDRAW\s+[^,]*,[^,]*,\s*"[^"]*$/,
        items: scan => scan.sprites.map(sprite => ({ label: sprite.name, detail: `Sprite with ${sprite.frames.length} frame(s)` })),
        kind: vscode.CompletionItemKind.Class,
    },
    {
        pattern: /\b(?:PLAY|STOP)\s+"[^"]*$/,
        items: scan => scan.songs.map(song => ({ label: song.name, detail: 'Song' })),
        kind: vscode.CompletionItemKind.Class,
    },
    {
        pattern: /\bINPUT\s*\(\s*"[^"]*$/,
        items: () => KEY_NAMES.map(([key, description]) => ({ label: key === ' ' ? 'SPACE' : key, insertText: key, detail: description })),
        kind: vscode.CompletionItemKind.Constant,
    },
    {
        pattern: /\bTYPE\s+"[^"]*$/,
        items: () => WAVE_TYPES.map(type => ({ label: type, detail: 'Wave type' })),
        kind: vscode.CompletionItemKind.EnumMember,
    },
    {
        // COLOR "| and the color of COLORDATA "#", "|
        pattern: /\b(?:COLOR|COLORDATA\s+"[^"]*"\s*,)\s*"[^"]*$/,
        // For the Color kind, VS Code shows a swatch of the color in `detail`
        items: () => COLORS.map(([name, hex]) => ({ label: name, detail: hex })),
        kind: vscode.CompletionItemKind.Color,
    },
];

/**
 * Whether a position is in code, in a string or in a comment, given the text of the line before it
 * @param {string} linePrefix
 * @returns {'code' | 'string' | 'comment'}
 */
function cursorContext(linePrefix) {
    let inString = false;
    for (const char of linePrefix) {
        if (char === '"') {
            inString = !inString;
        } else if (char === '#' && !inString) {
            return 'comment';
        }
    }

    return inString ? 'string' : 'code';
}

function entryDocumentation(entry) {
    return new vscode.MarkdownString().appendCodeblock(entry.signature, 'oneshot').appendMarkdown(entry.doc);
}

/** @type {vscode.CompletionItemProvider} */
const completionProvider = {
    provideCompletionItems(document, position) {
        const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
        const context = cursorContext(linePrefix);

        if (context === 'comment') {
            return [];
        }

        if (context === 'string') {
            return stringCompletions(document, position, linePrefix);
        }

        return codeCompletions(document);
    },
};

function stringCompletions(document, position, linePrefix) {
    for (const stringContext of STRING_CONTEXTS) {
        const match = stringContext.pattern.exec(linePrefix);
        if (!match) {
            continue;
        }

        // Replace what was typed since the opening quote
        const range = new vscode.Range(position.line, linePrefix.lastIndexOf('"') + 1, position.line, position.character);
        return stringContext.items(scanDocument(document.getText()), match).map(({ label, insertText, detail }) => {
            const item = new vscode.CompletionItem(label, stringContext.kind);
            item.insertText = insertText ?? label;
            item.detail = detail;
            item.range = range;
            return item;
        });
    }

    return [];
}

function codeCompletions(document) {
    const scan = scanDocument(document.getText());
    const items = [];

    // The program's own names come first
    for (const fn of scan.functions) {
        const item = new vscode.CompletionItem(fn.name, vscode.CompletionItemKind.Function);
        item.detail = `FUNC ${fn.name}(${fn.params.join(', ')})`;
        item.insertText = new vscode.SnippetString(`${fn.name}(${fn.params.map((param, i) => `\${${i + 1}:${param}}`).join(', ')})`);
        item.sortText = `0${fn.name}`;
        items.push(item);
    }

    for (const variable of scan.variables) {
        if (scan.functions.some(fn => fn.name === variable.name)) {
            continue;
        }

        const item = new vscode.CompletionItem(variable.name, vscode.CompletionItemKind.Variable);
        if (variable.parameterOf) {
            item.detail = `Parameter of ${variable.parameterOf}`;
        } else {
            item.detail = variable.isArray ? `LET ${variable.name}[...]` : `LET ${variable.name}`;
        }
        item.sortText = `0${variable.name}`;
        items.push(item);
    }

    for (const entry of ENTRIES) {
        const item = new vscode.CompletionItem(entry.name, ENTRY_KINDS[entry.kind]);
        item.detail = entry.signature.split('\n')[0];
        item.documentation = entryDocumentation(entry);
        if (entry.snippet) {
            item.insertText = new vscode.SnippetString(entry.snippet);
        }
        item.sortText = `1${entry.name}`;
        items.push(item);
    }

    for (const snippet of SNIPPETS) {
        const item = new vscode.CompletionItem(snippet.label, vscode.CompletionItemKind.Snippet);
        item.insertText = new vscode.SnippetString(snippet.body);
        item.documentation = new vscode.MarkdownString(snippet.doc);
        item.sortText = `2${snippet.label}`;
        items.push(item);
    }

    return items;
}

/** @type {vscode.HoverProvider} */
const hoverProvider = {
    provideHover(document, position) {
        const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
        if (!range) {
            return null;
        }

        const linePrefix = document.lineAt(position.line).text.slice(0, range.start.character);
        if (cursorContext(linePrefix) !== 'code') {
            return null;
        }

        const word = document.getText(range);
        const entry = ENTRIES_BY_NAME.get(word);
        if (entry) {
            return new vscode.Hover(entryDocumentation(entry), range);
        }

        const scan = scanDocument(document.getText());
        const fn = scan.functions.find(fn => fn.name === word);
        if (fn) {
            const markdown = new vscode.MarkdownString()
                .appendCodeblock(`FUNC ${fn.name}(${fn.params.join(', ')})`, 'oneshot')
                .appendMarkdown(`Declared on line ${fn.line + 1}`);
            return new vscode.Hover(markdown, range);
        }

        const variable = scan.variables.find(variable => variable.name === word);
        if (variable) {
            const markdown = new vscode.MarkdownString();
            if (variable.parameterOf) {
                markdown.appendMarkdown(`Parameter of \`${variable.parameterOf}\``);
            } else {
                markdown.appendCodeblock(variable.isArray ? `LET ${word}[...]` : `LET ${word}`, 'oneshot')
                    .appendMarkdown(`Declared on line ${variable.line + 1}`);
            }
            return new vscode.Hover(markdown, range);
        }

        return null;
    },
};

module.exports = { completionProvider, hoverProvider, cursorContext };
