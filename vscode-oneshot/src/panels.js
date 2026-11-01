// The run panel and the sprite & music preview. Both are webviews that load the real interpreter.

const vscode = require('vscode');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Finds oneShot.js. Inside the OneShot repository the extension uses the repository's own
 * interpreter, so it is always up to date. A packaged extension uses the copy that
 * `npm run vscode:prepublish` puts in media/.
 * @param {string} extensionPath
 */
function findInterpreter(extensionPath) {
    // The extension may be installed as a symlink to the repository, so resolve it first
    const root = fs.realpathSync(extensionPath);
    const candidates = [path.join(root, '..', 'oneShot.js'), path.join(root, 'media', 'oneShot.js')];

    const interpreter = candidates.find(file => fs.existsSync(file));
    if (!interpreter) {
        throw new Error('OneShot: could not find oneShot.js. Run "npm run vscode:prepublish" in the extension folder.');
    }

    return { root, interpreter };
}

/**
 * Creates a webview panel that loads oneShot.js and one script from media/.
 * The page posts { type: 'ready' } once it can receive messages.
 */
class InterpreterPanel {
    /** @type {vscode.Disposable[]} */
    disposables = [];

    /**
     * @param {vscode.ExtensionContext} context
     * @param {{ viewType: string, title: string, script: string, body: string }} options
     */
    constructor(context, { viewType, title, script, body }) {
        const { root, interpreter } = findInterpreter(context.extensionPath);
        const mediaFolder = path.join(root, 'media');

        this.panel = vscode.window.createWebviewPanel(viewType, title, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
            enableScripts: true,
            // Keep games and music running while the panel is in a background tab
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.file(mediaFolder), vscode.Uri.file(path.dirname(interpreter))],
        });

        const webview = this.panel.webview;
        const uri = file => webview.asWebviewUri(vscode.Uri.file(file));
        const nonce = crypto.randomBytes(16).toString('base64');

        webview.html = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="${uri(path.join(mediaFolder, 'style.css'))}">
    <title>${title}</title>
</head>
<body>
${body}
    <script nonce="${nonce}" src="${uri(interpreter)}"></script>
    <script nonce="${nonce}" src="${uri(path.join(mediaFolder, script))}"></script>
</body>
</html>`;

        // Messages posted before the page has loaded would be lost
        this.ready = new Promise(resolve => {
            this.disposables.push(webview.onDidReceiveMessage(message => {
                if (message.type === 'ready') {
                    resolve();
                } else {
                    this.onMessage(message);
                }
            }));
        });

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    /** Called with the messages the page sends */
    onMessage(message) {}

    async post(message) {
        await this.ready;
        return this.panel.webview.postMessage(message);
    }

    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
}

/**
 * Runs a OneShot file, with a canvas, the PRINT output and Run / Stop buttons.
 */
class RunPanel extends InterpreterPanel {
    /** @type {RunPanel | undefined} */
    static current;

    /** @type {vscode.Uri | undefined} The file that was run last */
    documentUri;

    /**
     * Runs a document, opening the panel if needed.
     * @param {vscode.ExtensionContext} context
     * @param {vscode.TextDocument} document
     * @param {boolean} takeFocus Games need the keyboard, but a run after saving shouldn't steal it from the editor
     */
    static run(context, document, takeFocus) {
        RunPanel.current ??= new RunPanel(context);
        RunPanel.current.run(document, takeFocus);
    }

    constructor(context) {
        super(context, {
            viewType: 'oneshot.run',
            title: 'OneShot',
            script: 'run.js',
            body: `
    <div class="toolbar">
        <button id="run" title="Run the file again">▶ Run</button>
        <button id="stop" class="secondary" title="Stop the program">■ Stop</button>
        <label class="muted">Zoom
            <select id="zoom">
                <option value="1">1×</option>
                <option value="2">2×</option>
                <option value="3">3×</option>
            </select>
        </label>
        <span id="status" class="idle"></span>
    </div>
    <canvas id="screen" tabindex="0" width="300" height="150"></canvas>
    <p class="muted">Click the game to give it the keyboard.</p>
    <div id="output"></div>`,
        });
    }

    /**
     * @param {vscode.TextDocument} document
     * @param {boolean} takeFocus
     */
    run(document, takeFocus) {
        this.documentUri = document.uri;
        const fileName = path.basename(document.fileName);
        this.panel.title = `Run ${fileName}`;
        this.panel.reveal(undefined, !takeFocus);

        // The text of the editor, so unsaved changes run too
        this.post({ type: 'run', source: document.getText(), fileName });
    }

    stop() {
        this.post({ type: 'stop' });
    }

    onMessage(message) {
        // The Run button asks for the latest text of the file
        if (message.type === 'run' && this.documentUri) {
            const document = vscode.workspace.textDocuments.find(document => document.uri.toString() === this.documentUri.toString());
            if (document) {
                this.run(document, true);
            } else {
                vscode.workspace.openTextDocument(this.documentUri).then(document => this.run(document, true));
            }
        }
    }

    dispose() {
        RunPanel.current = undefined;
        super.dispose();
    }
}

/**
 * Shows the sprites and songs of the active OneShot file, and updates as you type.
 */
class PreviewPanel extends InterpreterPanel {
    /** @type {PreviewPanel | undefined} */
    static current;

    /** @type {vscode.TextDocument | undefined} */
    document;

    /**
     * @param {vscode.ExtensionContext} context
     * @param {vscode.TextDocument} document
     */
    static show(context, document) {
        PreviewPanel.current ??= new PreviewPanel(context);
        PreviewPanel.current.panel.reveal(undefined, true);
        PreviewPanel.current.update(document);
    }

    constructor(context) {
        super(context, {
            viewType: 'oneshot.preview',
            title: 'OneShot Preview',
            script: 'preview.js',
            body: `
    <div class="toolbar">
        <strong id="file"></strong>
        <label class="muted">Animation speed <input id="fps" type="number" min="1" max="60"> fps</label>
    </div>
    <ul id="problems"></ul>
    <h2>Sprites</h2>
    <div id="sprites"></div>
    <h2>Songs</h2>
    <div id="songs"></div>`,
        });
    }

    /**
     * @param {vscode.TextDocument} document
     */
    update(document) {
        this.document = document;
        const fileName = path.basename(document.fileName);
        this.panel.title = `Preview ${fileName}`;
        this.post({ type: 'update', source: document.getText(), fileName });
    }

    dispose() {
        PreviewPanel.current = undefined;
        super.dispose();
    }
}

module.exports = { RunPanel, PreviewPanel, findInterpreter };
