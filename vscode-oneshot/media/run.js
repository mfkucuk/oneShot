// Runs OneShot programs in the run panel. oneShot.js is loaded before this script.
(function () {
    const vscode = acquireVsCodeApi();

    const canvas = document.getElementById('screen');
    const output = document.getElementById('output');
    const status = document.getElementById('status');
    const runButton = document.getElementById('run');
    const stopButton = document.getElementById('stop');
    const zoomSelect = document.getElementById('zoom');

    const state = vscode.getState() ?? { zoom: '2' };
    const oneShot = new OneShot('screen');
    oneShot.onPrint = message => appendOutput(`> ${message}`);

    /** Increases on every run and stop, so a finished run can tell whether it is still the current one */
    let runId = 0;

    window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'run') {
            run(message.source, message.fileName);
        } else if (message.type === 'stop') {
            stop();
        }
    });

    runButton.addEventListener('click', () => {
        // The extension answers with the latest text of the file
        vscode.postMessage({ type: 'run' });
    });

    stopButton.addEventListener('click', () => {
        stop();
        canvas.focus();
    });

    zoomSelect.value = state.zoom;
    zoomSelect.addEventListener('change', () => {
        state.zoom = zoomSelect.value;
        vscode.setState(state);
        updateCanvasSize();
        canvas.focus();
    });

    // WINDOW changes the canvas resolution, so keep the displayed size in sync with it
    new MutationObserver(updateCanvasSize).observe(canvas, { attributes: true, attributeFilter: ['width', 'height'] });
    updateCanvasSize();

    // Browsers only allow sound after the user interacts with the page
    for (const type of ['pointerdown', 'keydown']) {
        window.addEventListener(type, () => audioContext?.resume(), true);
    }

    async function run(source, fileName) {
        const id = ++runId;
        let failed = false;

        output.textContent = '';
        setStatus(`Running ${fileName}`, 'running');
        oneShot.onError = error => {
            failed = true;
            appendOutput(`! ${OneShot.formatError(error)}`, 'error');
        };

        canvas.focus();
        await oneShot.run(source);

        if (id === runId) {
            setStatus(failed ? `${fileName} stopped with an error` : `${fileName} finished`, failed ? 'error' : 'idle');
        }
    }

    function stop() {
        runId++;
        oneShot.stop();
        setStatus('Stopped', 'idle');
    }

    function updateCanvasSize() {
        const zoom = Number(state.zoom);
        canvas.style.width = `${canvas.width * zoom}px`;
        canvas.style.height = `${canvas.height * zoom}px`;
    }

    function setStatus(text, kind) {
        status.textContent = text;
        status.className = kind;
    }

    function appendOutput(text, className) {
        const line = document.createElement('div');
        line.textContent = text;
        if (className) {
            line.className = className;
        }
        output.append(line);
        output.scrollTop = output.scrollHeight;
    }

    vscode.postMessage({ type: 'ready' });
})();
