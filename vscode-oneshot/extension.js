// OneShot for Visual Studio Code: completion, hovers, a game runner and a sprite & music preview.
// Syntax highlighting is declarative, in syntaxes/oneshot.tmLanguage.json.

const vscode = require('vscode');
const { completionProvider, hoverProvider } = require('./src/completion');
const { RunPanel, PreviewPanel } = require('./src/panels');

/** The preview waits until typing pauses for this long before it updates */
const PREVIEW_DELAY_MS = 300;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    const selector = { language: 'oneshot' };
    let previewTimer;

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(selector, completionProvider, '"'),
        vscode.languages.registerHoverProvider(selector, hoverProvider),

        vscode.commands.registerCommand('oneshot.run', async uri => {
            const document = await oneShotDocument(uri);
            if (document) {
                RunPanel.run(context, document, true);
            }
        }),

        vscode.commands.registerCommand('oneshot.stop', () => RunPanel.current?.stop()),

        vscode.commands.registerCommand('oneshot.showPreview', async uri => {
            const document = await oneShotDocument(uri);
            if (document) {
                PreviewPanel.show(context, document);
            }
        }),

        // Run again on save, while the run panel shows that file
        vscode.workspace.onDidSaveTextDocument(document => {
            const runPanel = RunPanel.current;
            const runOnSave = vscode.workspace.getConfiguration('oneshot').get('runOnSave', true);
            if (runOnSave && runPanel?.documentUri?.toString() === document.uri.toString()) {
                runPanel.run(document, false);
            }
        }),

        // The preview follows the text as you type, and follows you to other OneShot files
        vscode.workspace.onDidChangeTextDocument(event => {
            const preview = PreviewPanel.current;
            if (preview?.document?.uri.toString() === event.document.uri.toString()) {
                clearTimeout(previewTimer);
                previewTimer = setTimeout(() => preview.update(event.document), PREVIEW_DELAY_MS);
            }
        }),

        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor?.document.languageId === 'oneshot' && PreviewPanel.current) {
                PreviewPanel.current.update(editor.document);
            }
        }),
    );
}

/**
 * The document a command should act on: the file it was invoked on (from the editor
 * title bar), or else the active editor.
 * @param {vscode.Uri} [uri]
 */
async function oneShotDocument(uri) {
    const document = uri instanceof vscode.Uri
        ? await vscode.workspace.openTextDocument(uri)
        : vscode.window.activeTextEditor?.document;

    if (document?.languageId !== 'oneshot') {
        vscode.window.showWarningMessage('Open a .oneshot file first.');
        return undefined;
    }

    return document;
}

function deactivate() {}

module.exports = { activate, deactivate };
