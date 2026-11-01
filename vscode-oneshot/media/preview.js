// Shows the sprites and songs of a OneShot file. oneShot.js is loaded before this script,
// and the real interpreter evaluates the SPRITE and SONG blocks, so the preview always
// matches what the game will show.
(function () {
    const vscode = acquireVsCodeApi();

    const fileLabel = document.getElementById('file');
    const problemList = document.getElementById('problems');
    const spritesSection = document.getElementById('sprites');
    const songsSection = document.getElementById('songs');
    const fpsInput = document.getElementById('fps');

    /** Sprite frames are shown at this many screen pixels per sprite pixel */
    const SPRITE_SCALE = 2;
    /** Piano rolls use at least this many pixels per beat, and short songs are stretched to MIN_ROLL_WIDTH */
    const BEAT_WIDTH = 12;
    const MIN_ROLL_WIDTH = 240;
    const SHEET_COLORS = ['#4FC1FF', '#F0A050', '#C586C0', '#89D185', '#F14C4C', '#E5C07B'];

    /** Evaluating a file stops after this long, so an endless loop can't hang the preview */
    const EVALUATION_TIMEOUT_MS = 1000;

    const state = vscode.getState() ?? { fps: 6 };

    /** @type {{ canvas: HTMLCanvasElement, frames: Frame[] }[]} */
    let animations = [];
    let animationTick = 0;
    let animationTimer = null;

    /** The song that is playing, and the piano roll that shows its playhead */
    let playing = null;
    let evaluationId = 0;

    window.addEventListener('message', event => {
        if (event.data.type === 'update') {
            update(event.data.source, event.data.fileName);
        }
    });

    fpsInput.value = state.fps;
    fpsInput.addEventListener('change', () => {
        state.fps = Math.max(1, Math.min(60, Number(fpsInput.value) || 6));
        fpsInput.value = state.fps;
        vscode.setState(state);
        startAnimations();
    });

    async function update(source, fileName) {
        const id = ++evaluationId;
        fileLabel.textContent = fileName;

        let result;
        try {
            result = await evaluate(source);
        } catch (error) {
            // A syntax error, usually while typing. Keep showing the last good preview.
            if (id === evaluationId) {
                showProblems([OneShot.formatError(error)]);
            }
            return;
        }

        if (id !== evaluationId) {
            return;
        }

        showProblems(result.problems);
        renderSprites(result.sprites);
        renderSongs(result.songs);
    }

    /**
     * Runs the top-level SPRITE and SONG blocks, plus the LET and FUNC declarations they
     * may use. Everything else, like the game loop, is skipped.
     * @param {string} source
     */
    async function evaluate(source) {
        const statements = new Parser(new Scanner(source).scanTokens()).parse();
        const runtime = new Runtime(null, () => {});
        const problems = [];

        const timeout = setTimeout(() => runtime.stop(), EVALUATION_TIMEOUT_MS);
        try {
            for (const statement of statements) {
                const isAsset = statement instanceof SpriteStatement || statement instanceof SongStatement;
                const isDeclaration = statement instanceof LetStatement || statement instanceof LetArrayStatement || statement instanceof FunctionStatement;
                if (!isAsset && !isDeclaration) {
                    continue;
                }

                try {
                    await executeStatements([statement], runtime.globals);
                } catch (error) {
                    if (error instanceof StopSignal) {
                        problems.push(`[Line ${statement.line}] Took too long to evaluate`);
                        break;
                    }

                    // Only problems in sprites and songs matter here
                    if (isAsset) {
                        problems.push(OneShot.formatError(error));
                    }
                }
            }
        } finally {
            clearTimeout(timeout);
        }

        return { sprites: runtime.sprites, songs: runtime.songs, problems };
    }

    function showProblems(problems) {
        problemList.replaceChildren(...problems.map(problem => element('li', 'problem', problem)));
    }


    /* Sprites */

    /**
     * @param {Map<any, Sprite>} sprites
     */
    function renderSprites(sprites) {
        animations = [];

        if (sprites.size === 0) {
            spritesSection.replaceChildren(element('p', 'empty', 'No sprites yet. Type SPRITE to create one.'));
            return;
        }

        const cards = [];
        for (const [name, sprite] of sprites) {
            const frames = element('div', 'frames');

            if (sprite.frames.length > 1) {
                const animation = frameCanvas(sprite.frames);
                animations.push({ canvas: animation, frames: sprite.frames });
                frames.append(figure(animation, 'Animation'));
            }

            sprite.frames.forEach((frame, index) => {
                const name = [...sprite.framesByName].find(([, value]) => value === frame)?.[0];
                const canvas = frameCanvas([frame]);
                drawFrame(canvas, frame);
                frames.append(figure(canvas, name === undefined ? `${index}` : `${index} · ${name}`));
            });

            const size = sprite.width === null ? '' : ` · ${sprite.width} × ${sprite.height}`;
            cards.push(element('section', 'card', [
                element('h3', null, [element('span', null, String(name)), element('small', null, `${sprite.frames.length} frame(s)${size}`)]),
                frames,
            ]));
        }

        spritesSection.replaceChildren(...cards);
        startAnimations();
    }

    /** A canvas big enough for the largest of the frames */
    function frameCanvas(frames) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(...frames.map(frame => frame.image.width));
        canvas.height = Math.max(...frames.map(frame => frame.image.height));
        canvas.style.width = `${canvas.width * SPRITE_SCALE}px`;
        canvas.style.height = `${canvas.height * SPRITE_SCALE}px`;
        canvas.className = 'sprite';
        return canvas;
    }

    function drawFrame(canvas, frame) {
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(frame.image, 0, 0);
    }

    function startAnimations() {
        clearInterval(animationTimer);
        animationTimer = setInterval(() => {
            animationTick++;
            for (const { canvas, frames } of animations) {
                drawFrame(canvas, frames[animationTick % frames.length]);
            }
        }, 1000 / state.fps);
    }


    /* Songs */

    /**
     * @param {Map<any, Song>} songs
     */
    function renderSongs(songs) {
        // Keep the playing song going if the edit didn't change it, otherwise restart it with the new notes
        const playingName = playing?.name;
        const playingSignature = playing && songSignature(playing.song);
        let replacement = null;

        if (songs.size === 0) {
            stopSong();
            songsSection.replaceChildren(element('p', 'empty', 'No songs yet. Type SONG to create one.'));
            return;
        }

        const cards = [];
        for (const [name, song] of songs) {
            const roll = createRoll(song);
            const button = element('button', null, '▶ Play');
            const card = { name, song, roll, button };
            button.addEventListener('click', () => playing?.name === name ? stopSong() : playSong(card));

            const totalBeats = Math.max(0, ...song.sheets.map(sheetBeats));
            const details = `BPM ${song.bpm}${song.loop ? ' · loops' : ''} · ${song.sheets.length} sheet(s) · ${totalBeats} beats`;
            const legend = element('div', 'legend', song.sheets.map((sheet, index) => {
                const swatch = element('span', 'swatch');
                swatch.style.background = SHEET_COLORS[index % SHEET_COLORS.length];
                return element('span', null, [swatch, `Sheet ${index + 1}: ${sheet.type}, gain ${Math.round(sheet.gain * 100)}`]);
            }));

            cards.push(element('section', 'card', [
                element('h3', null, [element('span', null, String(name)), element('small', null, details), button]),
                legend,
                element('div', 'roll', roll.canvas),
            ]));

            if (name === playingName) {
                replacement = card;
            }
        }

        songsSection.replaceChildren(...cards);

        if (!replacement) {
            stopSong();
        } else if (songSignature(replacement.song) === playingSignature) {
            // Same notes: move the playhead over to the new piano roll and keep playing
            playing.roll = replacement.roll;
            playing.button = replacement.button;
            playing.button.textContent = '■ Stop';
        } else {
            playSong(replacement);
        }
    }

    function sheetBeats(sheet) {
        return sheet.notes.reduce((beats, note) => beats + note.beats, 0);
    }

    function songSignature(song) {
        return JSON.stringify([song.bpm, song.loop, song.sheets.map(sheet => [sheet.type, sheet.gain, sheet.notes])]);
    }

    function midiNote(frequency) {
        return Math.round(69 + 12 * Math.log2(frequency / 440));
    }

    /**
     * A piano roll: time goes right, pitch goes up, and every sheet has its own color
     * @param {Song} song
     */
    function createRoll(song) {
        const notes = song.sheets.flatMap(sheet => sheet.notes.filter(note => note.frequency !== null));
        const pitches = notes.map(note => midiNote(note.frequency));
        const lowest = (pitches.length > 0 ? Math.min(...pitches) : 60) - 2;
        const highest = (pitches.length > 0 ? Math.max(...pitches) : 60) + 2;
        const rowHeight = Math.max(3, Math.min(8, Math.floor(160 / (highest - lowest + 1))));
        const totalBeats = Math.max(1, ...song.sheets.map(sheetBeats));
        const beatWidth = Math.max(BEAT_WIDTH, Math.min(40, Math.floor(MIN_ROLL_WIDTH / totalBeats)));

        const canvas = document.createElement('canvas');
        const width = totalBeats * beatWidth;
        const height = (highest - lowest + 1) * rowHeight;
        const scale = window.devicePixelRatio || 1;
        canvas.width = width * scale;
        canvas.height = height * scale;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const roll = { canvas, song, totalBeats, beatWidth, lowest, highest, rowHeight, scale };
        drawRoll(roll, null);
        return roll;
    }

    /**
     * @param {number?} playheadBeat
     */
    function drawRoll(roll, playheadBeat) {
        const { canvas, song, totalBeats, beatWidth, lowest, highest, rowHeight, scale } = roll;
        const context = canvas.getContext('2d');
        const height = (highest - lowest + 1) * rowHeight;

        context.setTransform(scale, 0, 0, scale, 0, 0);
        context.clearRect(0, 0, totalBeats * beatWidth, height);

        // Beat lines, stronger every 4 beats
        for (let beat = 0; beat <= totalBeats; beat++) {
            context.fillStyle = beat % 4 === 0 ? 'rgba(128, 128, 128, 0.35)' : 'rgba(128, 128, 128, 0.12)';
            context.fillRect(beat * beatWidth, 0, 1, height);
        }

        // A line at every C, to show the octaves
        context.fillStyle = 'rgba(128, 128, 128, 0.25)';
        for (let pitch = lowest; pitch <= highest; pitch++) {
            if (pitch % 12 === 0) {
                context.fillRect(0, (highest - pitch + 1) * rowHeight - 1, totalBeats * beatWidth, 1);
            }
        }

        song.sheets.forEach((sheet, index) => {
            context.fillStyle = SHEET_COLORS[index % SHEET_COLORS.length];
            let beat = 0;
            for (const note of sheet.notes) {
                if (note.frequency !== null) {
                    const y = (highest - midiNote(note.frequency)) * rowHeight;
                    context.fillRect(beat * beatWidth + 1, y, note.beats * beatWidth - 2, Math.max(2, rowHeight - 1));
                }
                beat += note.beats;
            }
        });

        if (playheadBeat !== null) {
            context.fillStyle = 'rgba(255, 255, 255, 0.85)';
            context.fillRect(playheadBeat * beatWidth, 0, 2, height);
        }
    }

    function playSong(card) {
        stopSong();

        // getAudioContext comes from oneShot.js. Song.play starts the notes 50ms from now.
        const context = getAudioContext();
        card.song.play();
        playing = { ...card, startTime: context.currentTime + 0.05 };
        playing.button.textContent = '■ Stop';
        requestAnimationFrame(movePlayhead);
    }

    function stopSong() {
        if (!playing) {
            return;
        }

        playing.song.stop();
        playing.button.textContent = '▶ Play';
        drawRoll(playing.roll, null);
        playing = null;
    }

    function movePlayhead() {
        if (!playing) {
            return;
        }

        const { song, roll, startTime } = playing;
        const beat = Math.max(0, (audioContext.currentTime - startTime) * song.bpm / 60);

        if (!song.loop && beat > roll.totalBeats) {
            stopSong();
            return;
        }

        drawRoll(roll, beat % roll.totalBeats);
        requestAnimationFrame(movePlayhead);
    }


    /* DOM helpers */

    /**
     * @param {string} tag
     * @param {string?} className
     * @param {string | Node | (string | Node)[]} [children]
     */
    function element(tag, className, children = []) {
        const node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        node.append(...[children].flat());
        return node;
    }

    function figure(canvas, caption) {
        return element('figure', null, [canvas, element('figcaption', null, caption)]);
    }

    vscode.postMessage({ type: 'ready' });
})();
