/*
 * OneShot is a sequential programming language used to
 * make games. This file is the interpreter for this language
 * written in pure vanilla JavaScript.
 *
 * How it works:
 *   source code ─► Scanner (tokens) ─► Parser (syntax tree) ─► tree-walking evaluation
 *
 * Every call to `OneShot.run` gets its own `Runtime`, which owns the canvas,
 * the sprites, the songs and the stop flag of that run.
 */


/* ==========================================================================
 * Helpers
 * ======================================================================= */

/**
 * Pause execution for [ms] milliseconds
 * @param {number} ms
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Only FALSE and NULL are falsy in OneShot. Everything else, including 0 and "", is truthy.
 * @param {any} value
 * @returns {boolean}
 */
function isTruthy(value) {
    if (value === null || value === undefined) {
        return false;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    return true;
}

/**
 * A short, human readable description of a value's type, for error messages.
 */
function describe(value) {
    if (value === null || value === undefined) return 'NULL';
    if (Array.isArray(value)) return 'an array';
    if (value instanceof OneShotFunction) return 'a function';
    return `a ${typeof value}`;
}

/**
 * @param {any} value
 * @param {string} what Used in the error message, e.g. "SLEEP"
 */
function expectNumber(value, what) {
    if (typeof value !== 'number') {
        throw new OneShotError(`${what} expects a number, got ${describe(value)}`);
    }

    return value;
}


/* ==========================================================================
 * Errors and control-flow signals
 * ======================================================================= */

/**
 * An error in a OneShot program. `line` is filled in by the parser, or by
 * `executeStatements` for errors that happen while the program runs.
 */
class OneShotError extends Error {
    /**
     * @param {string} message
     * @param {number} [line]
     */
    constructor(message, line) {
        super(message);
        this.name = 'OneShotError';
        this.line = line;
    }
}

/**
 * Thrown by RETURN and caught by the function call. It is not an Error on
 * purpose: creating Errors captures a stack trace, which makes calls slow.
 */
class ReturnSignal {
    constructor(value) {
        this.value = value;
    }
}

/**
 * Thrown when a running program is stopped, to unwind it immediately.
 */
class StopSignal {}


/* ==========================================================================
 * Input
 * ======================================================================= */

/** Keys whose default action (scrolling the page) is blocked while a program runs */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']);

class Input {
    /**
     * Upper-cased `KeyboardEvent.key` values of the keys that are held down.
     * @type {Set<string>}
     */
    #pressedKeys = new Set();

    /**
     * Remembers which key a physical key produced, so releasing it after
     * letting go of SHIFT still releases the right key.
     * @type {Map<string, string>}
     */
    #keyByCode = new Map();

    /**
     * Keys pressed since the last frame, and those of them that were already released.
     * A quick tap is kept down until the frame ends, so programs that check INPUT once
     * per frame never miss it.
     */
    #pressedThisFrame = new Set();
    #releasedThisFrame = new Set();

    mouseX = 0;
    mouseY = 0;

    /**
     * Canvas that mouse coordinates are relative to
     * @type {HTMLCanvasElement?}
     */
    canvas = null;

    /** True while a program runs, so arrow keys and space don't scroll the page */
    capturing = false;

    constructor() {
        if (typeof window === 'undefined') {
            return;
        }

        window.addEventListener('keydown', event => this.#onKeyDown(event));
        window.addEventListener('keyup', event => this.#onKeyUp(event));
        window.addEventListener('blur', () => this.#pressedKeys.clear());
        window.addEventListener('mousemove', event => this.#onMouseMove(event));
    }

    /**
     * @param {string} key e.g. "W", "ARROWUP", "ESCAPE" or " " for space
     */
    isDown(key) {
        return this.#pressedKeys.has(String(key).toUpperCase());
    }

    /**
     * Called when the program sleeps, which is where a frame ends.
     */
    endFrame() {
        for (const key of this.#releasedThisFrame) {
            this.#pressedKeys.delete(key);
        }

        this.#pressedThisFrame.clear();
        this.#releasedThisFrame.clear();
    }

    /**
     * @param {KeyboardEvent} event
     */
    #onKeyDown(event) {
        const key = event.key.toUpperCase();
        this.#pressedKeys.add(key);
        this.#pressedThisFrame.add(key);
        this.#keyByCode.set(event.code, key);

        const target = event.target;
        const isTyping = target && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
        if (this.capturing && SCROLL_KEYS.has(event.key) && !isTyping) {
            event.preventDefault();
        }
    }

    /**
     * @param {KeyboardEvent} event
     */
    #onKeyUp(event) {
        for (const key of [event.key.toUpperCase(), this.#keyByCode.get(event.code)]) {
            if (this.#pressedThisFrame.has(key)) {
                this.#releasedThisFrame.add(key);
            } else {
                this.#pressedKeys.delete(key);
            }
        }
    }

    /**
     * @param {MouseEvent} event
     */
    #onMouseMove(event) {
        if (!this.canvas) {
            return;
        }

        // The canvas may be displayed bigger or smaller than its resolution, e.g. when zoomed
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = (event.clientX - rect.left) * (this.canvas.width / (rect.width || this.canvas.width));
        this.mouseY = (event.clientY - rect.top) * (this.canvas.height / (rect.height || this.canvas.height));
    }
}

const input = new Input();


/* ==========================================================================
 * Sprites
 * ======================================================================= */

/** Every character of PIXELDATA is drawn as a square of this many pixels */
const SPRITE_PIXEL_SIZE = 4;

class Sprite {
    /** Set by SIZE; PIXELDATA is validated against it */
    width = null;
    height = null;

    /** @type {Frame[]} */
    frames = [];

    /** @type {Map<string, Frame>} */
    framesByName = new Map();

    /**
     * Frame being defined by the current FRAME block
     * @type {Frame?}
     */
    currentFrame = null;

    addFrame(name) {
        const frame = new Frame();
        this.frames.push(frame);
        if (name !== null && name !== undefined) {
            this.framesByName.set(name, frame);
        }
        this.currentFrame = frame;
        return frame;
    }

    /**
     * @param {number|string} frame Index or name of the frame
     */
    getFrame(frame) {
        const result = typeof frame === 'number' ? this.frames[frame] : this.framesByName.get(frame);
        if (!result) {
            throw new OneShotError(`Sprite has no frame ${JSON.stringify(frame)}`);
        }

        return result;
    }
}

class Frame {
    /** @type {Map<string, string>} character → CSS color */
    colors = new Map();

    /** @type {string[]} */
    rows = [];

    /** @type {HTMLCanvasElement?} */
    #image = null;

    setColor(char, color) {
        this.colors.set(char, color);
        this.#image = null;
    }

    addRow(row) {
        this.rows.push(row);
        this.#image = null;
    }

    /**
     * The frame pre-rendered onto its own canvas, so that DRAW
     * is a single drawImage call instead of one fillRect per pixel.
     */
    get image() {
        this.#image ??= this.#render();
        return this.#image;
    }

    #render() {
        const columns = Math.max(1, ...this.rows.map(row => row.length));

        const image = document.createElement('canvas');
        image.width = columns * SPRITE_PIXEL_SIZE;
        image.height = Math.max(1, this.rows.length) * SPRITE_PIXEL_SIZE;

        const context = image.getContext('2d');
        for (let y = 0; y < this.rows.length; y++) {
            for (let x = 0; x < this.rows[y].length; x++) {
                const color = this.colors.get(this.rows[y][x]);
                if (!color) {
                    continue;
                }

                context.fillStyle = color;
                context.fillRect(x * SPRITE_PIXEL_SIZE, y * SPRITE_PIXEL_SIZE, SPRITE_PIXEL_SIZE, SPRITE_PIXEL_SIZE);
            }
        }

        return image;
    }
}


/* ==========================================================================
 * BGM & SFX
 * ======================================================================= */

/**
 * @type {AudioContext?}
 */
let audioContext = null;

/**
 * The AudioContext is created lazily, because browsers only allow
 * audio after the user has interacted with the page.
 */
function getAudioContext() {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    return audioContext;
}

const WAVE_TYPES = new Set(['sine', 'square', 'sawtooth', 'triangle']);

/** Semitone distance of each note from A in the same octave */
const NOTE_OFFSETS = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

/** Notes are scheduled on the audio clock this many seconds ahead of time */
const SCHEDULE_AHEAD = 0.2;

/**
 * Converts a note such as "A4", "C#5" or "Bb3" into its frequency in Hz.
 * @param {string} note
 */
function noteFrequency(note) {
    const match = /^([A-G])([#B]?)(\d)$/i.exec(note);
    if (!match) {
        throw new OneShotError(`Invalid note '${note}'. Notes look like C4, F#3 or Bb5`);
    }

    const [, letter, accidental, octave] = match;
    let semitonesFromA4 = NOTE_OFFSETS[letter.toUpperCase()] + (Number(octave) - 4) * 12;
    if (accidental === '#') {
        semitonesFromA4++;
    } else if (accidental) {
        semitonesFromA4--;
    }

    return 440 * 2 ** (semitonesFromA4 / 12);
}

class Song {
    bpm = 120;
    loop = false;

    /** @type {Sheet[]} */
    sheets = [];

    addSheet() {
        const sheet = new Sheet(this);
        this.sheets.push(sheet);
        return sheet;
    }

    play() {
        const context = getAudioContext();
        const startTime = context.currentTime + 0.05;

        // Sheets play in the background, all starting at the same time
        for (const sheet of this.sheets) {
            sheet.play(context, startTime);
        }
    }

    stop() {
        for (const sheet of this.sheets) {
            sheet.stop();
        }
    }
}

class Sheet {
    gain = 0.8;
    type = 'sine';

    /** Note envelope, in milliseconds */
    attack = 2;
    release = 20;

    /**
     * A note is { frequency, beats }. Rests have a null frequency.
     * @type {{ frequency: number?, beats: number }[]}
     */
    notes = [];

    /** State of the current playback, replaced on every play */
    #playback = null;

    /**
     * @param {Song} song
     */
    constructor(song) {
        this.song = song;
    }

    /**
     * Adds the notes of a BAR. Notes are separated by whitespace:
     * "C4" is a note, "--" is a rest and ".." holds the previous note one beat longer.
     * @param {string} bar
     */
    addBar(bar) {
        for (const symbol of String(bar).split(/\s+/)) {
            if (symbol === '') {
                continue;
            }

            if (symbol === '..') {
                const previous = this.notes.at(-1);
                if (!previous) {
                    throw new OneShotError(`'..' needs a note before it to hold`);
                }
                previous.beats++;
                continue;
            }

            const frequency = symbol === '--' ? null : noteFrequency(symbol);
            this.notes.push({ frequency, beats: 1 });
        }
    }

    /**
     * @param {AudioContext} context
     * @param {number} startTime
     */
    async play(context, startTime) {
        this.stop();

        if (this.notes.length === 0) {
            return;
        }

        const output = context.createGain();
        output.gain.value = this.gain;
        output.connect(context.destination);

        const playback = { playing: true, oscillators: new Set() };
        this.#playback = playback;

        let time = startTime;
        do {
            for (const note of this.notes) {
                if (!playback.playing) {
                    break;
                }

                const duration = note.beats * 60 / this.song.bpm;
                if (note.frequency !== null) {
                    this.#scheduleTone(context, output, playback, note.frequency, time, duration);
                }
                time += duration;

                // Scheduling on the audio clock keeps sheets in sync; only sleep
                // so we don't schedule more than SCHEDULE_AHEAD seconds ahead.
                const wait = time - context.currentTime - SCHEDULE_AHEAD;
                if (wait > 0) {
                    await sleep(wait * 1000);
                }
            }
        } while (playback.playing && this.song.loop);

        if (playback.playing) {
            // Let the last notes ring out
            await sleep((time - context.currentTime) * 1000 + 100);
        }

        output.disconnect();
    }

    stop() {
        if (!this.#playback) {
            return;
        }

        this.#playback.playing = false;
        for (const oscillator of this.#playback.oscillators) {
            oscillator.stop();
        }
        this.#playback = null;
    }

    #scheduleTone(context, output, playback, frequency, time, duration) {
        const attack = Math.min(duration / 2, this.attack / 1000);
        const release = Math.min(duration / 2, this.release / 1000);

        const envelope = context.createGain();
        envelope.gain.setValueAtTime(0, time);
        envelope.gain.linearRampToValueAtTime(1, time + attack);
        envelope.gain.setValueAtTime(1, time + duration - release);
        envelope.gain.linearRampToValueAtTime(0, time + duration);
        envelope.connect(output);

        const oscillator = context.createOscillator();
        oscillator.type = this.type;
        oscillator.frequency.value = frequency;
        oscillator.connect(envelope);
        oscillator.start(time);
        oscillator.stop(time + duration);

        playback.oscillators.add(oscillator);
        oscillator.onended = () => {
            playback.oscillators.delete(oscillator);
            oscillator.disconnect();
            envelope.disconnect();
        };
    }
}


/* ==========================================================================
 * Tokens
 * ======================================================================= */

/**
 * Reserved words. Keywords are upper case and their token type is the word itself.
 */
const KEYWORDS = new Set([
    // Keywords
    'AND', 'OR', 'TRUE', 'FALSE', 'NULL',
    'IF', 'ELSE', 'FOR', 'WHILE', 'THEN', 'END',
    'LET', 'FUNC', 'RETURN', 'ALL', 'IMPORT',

    // Built-in values and functions
    'MOUSEX', 'MOUSEY', 'RANDOM', 'INPUT', 'INT', 'FLOOR', 'CEIL', 'SQRT', 'LEN',

    // Commands
    'DEBUG', 'PRINT', 'WINDOW', 'COLOR', 'FILL', 'TEXT', 'SLEEP', 'DRAW',

    // Sprite
    'SPRITE', 'SIZE', 'FRAME', 'COLORDATA', 'PIXELDATA',

    // BGM & SFX
    'SONG', 'SHEET', 'BAR', 'GAIN', 'BPM', 'LOOP', 'TYPE', 'PLAY', 'STOP',
]);

/**
 * All the allowed tokens in OneShot. Each token type is its own name,
 * which makes tokens easy to read while debugging.
 */
const TokenType = Object.freeze(Object.fromEntries([
    // Single character token types
    'LEFT_P', 'RIGHT_P', 'LEFT_B', 'RIGHT_B',
    'COLON', 'COMMA', 'MINUS', 'PLUS', 'SLASH', 'STAR', 'MOD',

    // One or two character token types
    'NOT', 'NOT_EQUAL', 'EQUAL', 'EQUAL_EQUAL',
    'GREATER', 'GREATER_EQUAL', 'LESS', 'LESS_EQUAL',
    'PLUSPLUS', 'MINUSMINUS',

    // Literal token types
    'IDENTIFIER', 'STRING', 'NUMBER',

    ...KEYWORDS,

    'EOF',
].map(type => [type, type])));

class Token {
    /**
     * @param {string} type One of TokenType
     * @param {string} lexeme The source text of the token
     * @param {any} literal Value of STRING and NUMBER tokens
     * @param {number} line
     */
    constructor(type, lexeme, literal, line) {
        this.type = type;
        this.lexeme = lexeme;
        this.literal = literal;
        this.line = line;
    }
}


/* ==========================================================================
 * Scanner: source code → tokens
 * ======================================================================= */

class Scanner {

    #source;
    #tokens = [];
    #start = 0;
    #current = 0;
    #line = 1;

    /**
     * @param {string} source
     */
    constructor(source) {
        this.#source = source;
    }

    scanTokens() {
        while (!this.#isAtEnd()) {
            this.#start = this.#current;
            this.#scanToken();
        }

        this.#tokens.push(new Token(TokenType.EOF, '', null, this.#line));
        return this.#tokens;
    }

    #scanToken() {
        const c = this.#advance();
        switch (c) {
            case '(': this.#addToken(TokenType.LEFT_P); break;
            case ')': this.#addToken(TokenType.RIGHT_P); break;
            case '[': this.#addToken(TokenType.LEFT_B); break;
            case ']': this.#addToken(TokenType.RIGHT_B); break;
            case ':': this.#addToken(TokenType.COLON); break;
            case ',': this.#addToken(TokenType.COMMA); break;
            case '/': this.#addToken(TokenType.SLASH); break;
            case '*': this.#addToken(TokenType.STAR); break;
            case '%': this.#addToken(TokenType.MOD); break;
            case '!': this.#addToken(TokenType.NOT); break;
            case '-': this.#addToken(this.#match('-') ? TokenType.MINUSMINUS : TokenType.MINUS); break;
            case '+': this.#addToken(this.#match('+') ? TokenType.PLUSPLUS : TokenType.PLUS); break;
            case '=': this.#addToken(this.#match('=') ? TokenType.EQUAL_EQUAL : TokenType.EQUAL); break;
            case '>': this.#addToken(this.#match('=') ? TokenType.GREATER_EQUAL : TokenType.GREATER); break;

            case '<':
                if (this.#match('=')) {
                    this.#addToken(TokenType.LESS_EQUAL);
                } else if (this.#match('>')) {
                    this.#addToken(TokenType.NOT_EQUAL);
                } else {
                    this.#addToken(TokenType.LESS);
                }
                break;

            // Comments run until the end of the line
            case '#':
                while (this.#peek() !== '\n' && !this.#isAtEnd()) {
                    this.#advance();
                }
                break;

            case ' ':
            case '\r':
            case '\t':
                break;

            case '\n':
                this.#line++;
                break;

            case '"': this.#string(); break;

            default:
                if (this.#isDigit(c)) {
                    this.#number();
                } else if (this.#isAlpha(c)) {
                    this.#identifier();
                } else {
                    throw new OneShotError(`Unexpected character '${c}'`, this.#line);
                }
                break;
        }
    }

    #isAtEnd() {
        return this.#current >= this.#source.length;
    }

    #advance() {
        return this.#source.charAt(this.#current++);
    }

    #addToken(type, literal = null) {
        const text = this.#source.substring(this.#start, this.#current);
        this.#tokens.push(new Token(type, text, literal, this.#line));
    }

    #match(expectedChar) {
        if (this.#peek() !== expectedChar) {
            return false;
        }

        this.#current++;
        return true;
    }

    #peek() {
        return this.#isAtEnd() ? '\0' : this.#source.charAt(this.#current);
    }

    #peekNext() {
        return this.#current + 1 >= this.#source.length ? '\0' : this.#source.charAt(this.#current + 1);
    }

    #string() {
        const startLine = this.#line;
        while (this.#peek() !== '"' && !this.#isAtEnd()) {
            if (this.#peek() === '\n') {
                this.#line++;
            }
            this.#advance();
        }

        if (this.#isAtEnd()) {
            throw new OneShotError('Unterminated string', startLine);
        }

        this.#advance(); // The closing "

        const value = this.#source.substring(this.#start + 1, this.#current - 1);
        this.#addToken(TokenType.STRING, value);
    }

    #number() {
        while (this.#isDigit(this.#peek())) {
            this.#advance();
        }

        if (this.#peek() === '.' && this.#isDigit(this.#peekNext())) {
            this.#advance();

            while (this.#isDigit(this.#peek())) {
                this.#advance();
            }
        }

        const value = parseFloat(this.#source.substring(this.#start, this.#current));
        this.#addToken(TokenType.NUMBER, value);
    }

    #identifier() {
        while (this.#isAlphaNumeric(this.#peek())) {
            this.#advance();
        }

        const text = this.#source.substring(this.#start, this.#current);
        this.#addToken(KEYWORDS.has(text) ? text : TokenType.IDENTIFIER);
    }

    #isDigit(c) {
        return c >= '0' && c <= '9';
    }

    #isAlpha(c) {
        return (c >= 'a' && c <= 'z') ||
               (c >= 'A' && c <= 'Z') ||
               c === '_';
    }

    #isAlphaNumeric(c) {
        return this.#isAlpha(c) || this.#isDigit(c);
    }
}


/* ==========================================================================
 * Runtime
 * ======================================================================= */

/** Loops give the browser a chance to handle input and repaint at least this often */
const MAX_BUSY_MS = 30;

const TEXT_FONT = '20px dejavu, monospace';

/**
 * Everything that belongs to a single run of a program.
 */
class Runtime {
    stopped = false;

    /** @type {HTMLCanvasElement?} */
    canvas;

    /** @type {CanvasRenderingContext2D?} */
    ctx;

    /** @type {Map<any, Sprite>} */
    sprites = new Map();
    /** @type {Sprite?} Sprite being defined by the current SPRITE block */
    currentSprite = null;

    /** @type {Map<any, Song>} */
    songs = new Map();
    /** @type {Song?} Song being defined by the current SONG block */
    currentSong = null;
    /** @type {Sheet?} Sheet being defined by the current SHEET block */
    currentSheet = null;

    #lastYield = performance.now();

    /**
     * @param {HTMLCanvasElement?} canvas
     * @param {(message: any) => void} onPrint
     */
    constructor(canvas, onPrint) {
        /** @type {Set<string>} Libraries this run has imported */
        this.imported = new Set();
        this.canvas = canvas;
        this.ctx = canvas?.getContext('2d') ?? null;
        this.onPrint = onPrint;
        this.globals = new Environment(null, this);
    }

    /**
     * The 2D context to draw on
     */
    get graphics() {
        if (!this.ctx) {
            throw new OneShotError('There is no window to draw on. Open one with WINDOW width, height');
        }

        return this.ctx;
    }

    openWindow(width, height) {
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            document.body.appendChild(this.canvas);
        }

        if (!this.canvas.oneShotSetup) {
            this.canvas.addEventListener('contextmenu', event => event.preventDefault());
            this.canvas.oneShotSetup = true;
        }

        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = expectNumber(width, 'WINDOW');
        this.canvas.height = expectNumber(height, 'WINDOW');
        input.canvas = this.canvas;
    }

    /**
     * @param {string} command Used in the error message
     */
    requireSprite(command) {
        if (!this.currentSprite) {
            throw new OneShotError(`${command} can only be used inside a SPRITE block`);
        }

        return this.currentSprite;
    }

    requireFrame(command) {
        const frame = this.requireSprite(command).currentFrame;
        if (!frame) {
            throw new OneShotError(`${command} can only be used inside a FRAME block`);
        }

        return frame;
    }

    requireSong(command) {
        if (!this.currentSong) {
            throw new OneShotError(`${command} can only be used inside a SONG block`);
        }

        return this.currentSong;
    }

    requireSheet(command) {
        if (!this.currentSheet) {
            throw new OneShotError(`${command} can only be used inside a SHEET block`);
        }

        return this.currentSheet;
    }

    getSong(name) {
        const song = this.songs.get(name);
        if (!song) {
            throw new OneShotError(`Undefined song: ${name}`);
        }

        return song;
    }

    stop() {
        this.stopped = true;

        for (const song of this.songs.values()) {
            song.stop();
        }
    }

    async sleep(ms) {
        input.endFrame();
        await sleep(ms);
        this.#lastYield = performance.now();

        if (this.stopped) {
            throw new StopSignal();
        }
    }

    /**
     * Called on every loop iteration. Stops the program if it was stopped and
     * keeps the page responsive in loops that never SLEEP.
     */
    async loopTick() {
        if (this.stopped) {
            throw new StopSignal();
        }

        if (performance.now() - this.#lastYield > MAX_BUSY_MS) {
            await this.sleep(0);
        }
    }
}

class Environment {

    /** @type {Map<string, any>} */
    #values = new Map();

    /**
     * @param {Environment?} enclosing
     * @param {Runtime} [runtime]
     */
    constructor(enclosing, runtime = enclosing.runtime) {
        this.enclosing = enclosing;
        this.runtime = runtime;
    }

    define(name, value) {
        // Values are never stored as undefined, so `get` needs only one lookup per scope
        this.#values.set(name, value ?? null);
    }

    /**
     * @param {string} name
     */
    get(name) {
        for (let environment = this; environment; environment = environment.enclosing) {
            const value = environment.#values.get(name);
            if (value !== undefined) {
                return value;
            }
        }

        const library = LIBRARY_OF.get(name);
        if (library) {
            throw new OneShotError(`${name} is in the ${library} library. Add IMPORT ${library} at the top of the program`);
        }

        throw new OneShotError(`Undefined variable: ${name}`);
    }

    /**
     * @param {string} name
     * @param {*} value
     */
    assign(name, value) {
        for (let environment = this; environment; environment = environment.enclosing) {
            if (environment.#values.has(name)) {
                environment.#values.set(name, value ?? null);
                return;
            }
        }

        throw new OneShotError(`Undefined variable: ${name}. Declare it first with LET ${name}`);
    }
}

/**
 * Runs statements one after another. If one of them fails, the error
 * is tagged with the line of the innermost statement that failed.
 * @param {Statement[]} statements
 * @param {Environment} environment
 */
async function executeStatements(statements, environment) {
    for (const statement of statements) {
        try {
            await statement.execute(environment);
        } catch (error) {
            if (error instanceof Error && error.line === undefined) {
                error.line = statement.line;
                error.file = statement.file;
            }
            throw error;
        }
    }
}

class OneShotFunction {
    /**
     * @param {FunctionStatement} declaration
     * @param {Environment} closure The environment the function was declared in
     */
    constructor(declaration, closure) {
        this.declaration = declaration;
        this.closure = closure;
    }

    get name() {
        return this.declaration.name.lexeme;
    }

    get arity() {
        return this.declaration.params.length;
    }

    /**
     * @param {any[]} args
     */
    async call(args) {
        const environment = new Environment(this.closure);
        const params = this.declaration.params;
        for (let i = 0; i < params.length; i++) {
            environment.define(params[i].lexeme, args[i]);
        }

        try {
            await executeStatements(this.declaration.body, environment);
        } catch (signal) {
            if (signal instanceof ReturnSignal) {
                return signal.value;
            }
            throw signal;
        }

        return null;
    }
}


/* ==========================================================================
 * Expressions
 * ======================================================================= */

/*
 * Expressions are evaluated with `await expression.evaluate(environment)`.
 * Leaf expressions (literals and plain variables) return their value directly
 * instead of a Promise, which skips creating a Promise for the most common nodes.
 */
class Expression {
    /**
     * @param {Environment} environment
     * @returns {any | Promise<any>}
     */
    evaluate(environment) {}
}

class LiteralExpression extends Expression {
    constructor(value) {
        super();
        this.value = value;
    }

    evaluate(environment) {
        return this.value;
    }
}

class VariableExpression extends Expression {
    /**
     * @param {Token} name
     * @param {Expression?} index Set for array accesses like ARRAY[I]
     */
    constructor(name, index = null) {
        super();
        this.name = name;
        this.index = index;
    }

    evaluate(environment) {
        const value = environment.get(this.name.lexeme);
        if (!this.index) {
            return value;
        }

        return this.#element(value, environment);
    }

    async #element(array, environment) {
        return array[await this.checkedIndex(array, environment)];
    }

    /**
     * Evaluates the index and checks that it is valid for [array]
     * @param {any} array
     * @param {Environment} environment
     */
    async checkedIndex(array, environment) {
        const name = this.name.lexeme;
        if (!Array.isArray(array)) {
            throw new OneShotError(`${name} is not an array, it is ${describe(array)}`);
        }

        const index = await this.index.evaluate(environment);
        if (!Number.isInteger(index) || index < 0 || index >= array.length) {
            throw new OneShotError(`Index ${index} is out of bounds for ${name} (length ${array.length})`);
        }

        return index;
    }
}

class AssignmentExpression extends Expression {
    /**
     * @param {VariableExpression} target
     * @param {Expression} value
     */
    constructor(target, value) {
        super();
        this.target = target;
        this.value = value;
    }

    async evaluate(environment) {
        const name = this.target.name.lexeme;

        if (this.target.index) {
            const array = environment.get(name);
            const index = await this.target.checkedIndex(array, environment);
            return array[index] = await this.value.evaluate(environment);
        }

        const value = await this.value.evaluate(environment);
        environment.assign(name, value);
        return value;
    }
}

/**
 * ++ and --, both prefix (++X) and postfix (X++). Works on variables and array elements.
 */
class UpdateExpression extends Expression {
    /**
     * @param {VariableExpression} target
     * @param {Token} operator
     * @param {boolean} isPrefix
     */
    constructor(target, operator, isPrefix) {
        super();
        this.target = target;
        this.delta = operator.type === TokenType.PLUSPLUS ? 1 : -1;
        this.isPrefix = isPrefix;
    }

    async evaluate(environment) {
        const name = this.target.name.lexeme;
        let oldValue;

        if (this.target.index) {
            const array = environment.get(name);
            const index = await this.target.checkedIndex(array, environment);
            oldValue = expectNumber(array[index], '++ and --');
            array[index] = oldValue + this.delta;
        } else {
            oldValue = expectNumber(environment.get(name), '++ and --');
            environment.assign(name, oldValue + this.delta);
        }

        return this.isPrefix ? oldValue + this.delta : oldValue;
    }
}

class BinaryExpression extends Expression {
    /**
     * @param {Expression} left
     * @param {Token} operator
     * @param {Expression} right
     */
    constructor(left, operator, right) {
        super();
        this.left = left;
        this.operator = operator;
        this.right = right;
    }

    async evaluate(environment) {
        const left = await this.left.evaluate(environment);
        const right = await this.right.evaluate(environment);
        const type = this.operator.type;

        switch (type) {
            case TokenType.EQUAL_EQUAL: return left === right;
            case TokenType.NOT_EQUAL: return left !== right;

            case TokenType.PLUS:
                if (typeof left === 'number' && typeof right === 'number') {
                    return left + right;
                }
                if (typeof left === 'string' || typeof right === 'string') {
                    return `${left}${right}`;
                }
                throw new OneShotError(`+ needs two numbers or a string, got ${describe(left)} and ${describe(right)}`);
        }

        if (typeof left !== 'number' || typeof right !== 'number') {
            throw new OneShotError(`${this.operator.lexeme} needs two numbers, got ${describe(left)} and ${describe(right)}`);
        }

        switch (type) {
            case TokenType.MINUS: return left - right;
            case TokenType.STAR: return left * right;
            case TokenType.SLASH: return left / right;
            case TokenType.MOD: return left % right;
            case TokenType.GREATER: return left > right;
            case TokenType.GREATER_EQUAL: return left >= right;
            case TokenType.LESS: return left < right;
            case TokenType.LESS_EQUAL: return left <= right;
        }
    }
}

/**
 * AND and OR. They short-circuit: the right side is only evaluated when needed.
 */
class LogicalExpression extends Expression {
    /**
     * @param {Expression} left
     * @param {Token} operator
     * @param {Expression} right
     */
    constructor(left, operator, right) {
        super();
        this.left = left;
        this.isOr = operator.type === TokenType.OR;
        this.right = right;
    }

    async evaluate(environment) {
        const left = await this.left.evaluate(environment);

        if (isTruthy(left) === this.isOr) {
            return left;
        }

        return await this.right.evaluate(environment);
    }
}

class UnaryExpression extends Expression {
    /**
     * @param {Token} operator
     * @param {Expression} right
     */
    constructor(operator, right) {
        super();
        this.operator = operator;
        this.right = right;
    }

    async evaluate(environment) {
        const right = await this.right.evaluate(environment);

        if (this.operator.type === TokenType.NOT) {
            return !isTruthy(right);
        }

        return -expectNumber(right, 'Negation');
    }
}

class CallExpression extends Expression {
    /**
     * @param {Expression} callee
     * @param {Token} paren
     * @param {Expression[]} args
     */
    constructor(callee, paren, args) {
        super();
        this.callee = callee;
        this.paren = paren;
        this.args = args;
    }

    async evaluate(environment) {
        const callee = await this.callee.evaluate(environment);

        if (!(callee instanceof OneShotFunction)) {
            throw new OneShotError(`Only functions can be called, but this is ${describe(callee)}`);
        }

        if (callee.arity !== this.args.length) {
            throw new OneShotError(`${callee.name} expects ${callee.arity} argument(s) but got ${this.args.length}`);
        }

        const args = [];
        for (const arg of this.args) {
            args.push(await arg.evaluate(environment));
        }

        return await callee.call(args);
    }
}

/**
 * Built-in functions, keyed by their keyword. Functions marked
 * `numeric` check that all their arguments are numbers.
 */
const BUILTINS = new Map([
    ['RANDOM',  { arity: 0, call: () => Math.random() }],
    ['INPUT',   { arity: 1, call: key => input.isDown(key) }],
    ['INT',     { arity: 1, call: value => Math.trunc(Number(value)) }],
    ['FLOOR',   { arity: 1, numeric: true, call: Math.floor }],
    ['CEIL',    { arity: 1, numeric: true, call: Math.ceil }],
    ['SQRT',    { arity: 1, numeric: true, call: Math.sqrt }],
    ['LEN',     { arity: 1, call: value => {
        if (!Array.isArray(value) && typeof value !== 'string') {
            throw new OneShotError(`LEN expects an array or a text, got ${describe(value)}`);
        }

        return value.length;
    } }],
]);

/**
 * Functions that used to be built in and now live in a library, so a program
 * that forgets to import them gets a helpful error.
 */
const LIBRARY_OF = new Map([
    ...['MIN', 'MAX', 'ABS', 'LERP', 'SUM'].map(name => [name, 'math']),
    ['COLLIDE', 'geometry'],
]);

/**
 * Built-in values that are used without parentheses
 */
const BUILTIN_VALUES = new Map([
    ['MOUSEX', { arity: 0, call: () => input.mouseX }],
    ['MOUSEY', { arity: 0, call: () => input.mouseY }],
]);

class BuiltinCallExpression extends Expression {
    /**
     * @param {Token} keyword
     * @param {{ arity: number, numeric?: boolean, call: Function }} builtin
     * @param {Expression[]} args
     */
    constructor(keyword, builtin, args) {
        super();
        this.keyword = keyword;
        this.builtin = builtin;
        this.args = args;
    }

    async evaluate(environment) {
        const values = [];
        for (const arg of this.args) {
            const value = await arg.evaluate(environment);
            if (this.builtin.numeric) {
                expectNumber(value, this.keyword.lexeme);
            }
            values.push(value);
        }

        return this.builtin.call(...values);
    }
}


/* ==========================================================================
 * Statements
 * ======================================================================= */

class Statement {
    /** Source line, set by the parser */
    line;

    /**
     * @param {Environment} environment
     */
    async execute(environment) {}
}

class ExpressionStatement extends Statement {
    /**
     * @param {Expression} expression
     */
    constructor(expression) {
        super();
        this.expression = expression;
    }

    async execute(environment) {
        await this.expression.evaluate(environment);
    }
}

/**
 * Commands are statements that take a fixed number of comma-separated
 * arguments, like `FILL x, y, width, height`. Each command's `run` receives
 * the Runtime followed by the evaluated arguments.
 */
const COMMANDS = new Map([
    ['PRINT', { usage: 'PRINT value', arity: 1, run: (runtime, value) => runtime.onPrint(value) }],
    ['DEBUG', { usage: 'DEBUG value', arity: 1, run: (runtime, value) => console.log(value) }],
    ['SLEEP', { usage: 'SLEEP milliseconds', arity: 1, run: (runtime, ms) => runtime.sleep(expectNumber(ms, 'SLEEP')) }],

    // Graphics
    ['WINDOW', { usage: 'WINDOW width, height', arity: 2, run: (runtime, width, height) => runtime.openWindow(width, height) }],

    ['COLOR', { usage: 'COLOR "red"', arity: 1, run: (runtime, color) => {
        runtime.graphics.fillStyle = color;
    } }],

    ['FILL', { usage: 'FILL x, y, width, height', arity: 4, run: (runtime, x, y, width, height) => {
        runtime.graphics.fillRect(x, y, width, height);
    } }],

    ['TEXT', { usage: 'TEXT x, y, text', arity: 3, run: (runtime, x, y, text) => {
        const ctx = runtime.graphics;
        ctx.font = TEXT_FONT;
        ctx.fillText(String(text), x, y);
    } }],

    ['DRAW', { usage: 'DRAW x, y, sprite, frame', arity: 4, run: (runtime, x, y, name, frame) => {
        const sprite = runtime.sprites.get(name);
        if (!sprite) {
            throw new OneShotError(`Undefined sprite: ${name}`);
        }

        const ctx = runtime.graphics;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sprite.getFrame(frame).image, Math.round(x), Math.round(y));
    } }],

    // Sprite
    ['SIZE', { usage: 'SIZE width, height', arity: 2, run: (runtime, width, height) => {
        const sprite = runtime.requireSprite('SIZE');
        sprite.width = expectNumber(width, 'SIZE');
        sprite.height = expectNumber(height, 'SIZE');
    } }],

    ['COLORDATA', { usage: 'COLORDATA "#", "green"', arity: 2, run: (runtime, char, color) => {
        runtime.requireFrame('COLORDATA').setColor(char, color);
    } }],

    ['PIXELDATA', { usage: 'PIXELDATA " ## "', arity: 1, run: (runtime, row) => {
        const sprite = runtime.requireSprite('PIXELDATA');
        const frame = runtime.requireFrame('PIXELDATA');
        row = String(row);

        if (sprite.width !== null && row.length > sprite.width) {
            throw new OneShotError(`PIXELDATA is ${row.length} wide, but the SPRITE SIZE is ${sprite.width}`);
        }

        if (sprite.height !== null && frame.rows.length >= sprite.height) {
            throw new OneShotError(`FRAME has more PIXELDATA rows than the SPRITE height of ${sprite.height}`);
        }

        frame.addRow(row);
    } }],

    // BGM & SFX
    ['BAR', { usage: 'BAR "C4 D4 E4 --"', arity: 1, run: (runtime, bar) => {
        runtime.requireSheet('BAR').addBar(bar);
    } }],

    ['GAIN', { usage: 'GAIN 80', arity: 1, run: (runtime, gain) => {
        runtime.requireSheet('GAIN').gain = expectNumber(gain, 'GAIN') / 100;
    } }],

    ['TYPE', { usage: 'TYPE "square"', arity: 1, run: (runtime, type) => {
        const waveType = String(type).toLowerCase();
        if (!WAVE_TYPES.has(waveType)) {
            throw new OneShotError(`TYPE must be one of ${[...WAVE_TYPES].join(', ')}`);
        }

        runtime.requireSheet('TYPE').type = waveType;
    } }],

    ['BPM', { usage: 'BPM 120', arity: 1, run: (runtime, bpm) => {
        runtime.requireSong('BPM').bpm = expectNumber(bpm, 'BPM');
    } }],

    ['LOOP', { usage: 'LOOP TRUE', arity: 1, run: (runtime, loop) => {
        runtime.requireSong('LOOP').loop = isTruthy(loop);
    } }],

    ['PLAY', { usage: 'PLAY "song"', arity: 1, run: (runtime, name) => runtime.getSong(name).play() }],
    ['STOP', { usage: 'STOP "song"', arity: 1, run: (runtime, name) => runtime.getSong(name).stop() }],
]);

/** FILL ALL fills the whole window */
const FILL_ALL_COMMAND = { arity: 0, run: (runtime) => {
    const ctx = runtime.graphics;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
} };

class CommandStatement extends Statement {
    /**
     * @param {{ run: Function }} command One of COMMANDS
     * @param {Expression[]} args
     */
    constructor(command, args) {
        super();
        this.command = command;
        this.args = args;
    }

    async execute(environment) {
        const runtime = environment.runtime;
        const values = [];
        for (const arg of this.args) {
            values.push(await arg.evaluate(environment));
        }

        // A stopped program must not draw over the program that replaced it
        if (runtime.stopped) {
            throw new StopSignal();
        }

        await this.command.run(runtime, ...values);
    }
}

class LetStatement extends Statement {
    /**
     * @param {Token} name
     * @param {Expression?} initializer
     */
    constructor(name, initializer) {
        super();
        this.name = name;
        this.initializer = initializer;
    }

    async execute(environment) {
        const value = this.initializer ? await this.initializer.evaluate(environment) : null;
        environment.define(this.name.lexeme, value);
    }
}

/**
 * LET ARRAY[SIZE] declares an array filled with NULL
 */
class LetArrayStatement extends Statement {
    /**
     * @param {Token} name
     * @param {Expression} size
     */
    constructor(name, size) {
        super();
        this.name = name;
        this.size = size;
    }

    async execute(environment) {
        const size = await this.size.evaluate(environment);

        if (!Number.isInteger(size) || size < 0) {
            throw new OneShotError(`Invalid array size for ${this.name.lexeme}: ${size}`);
        }

        environment.define(this.name.lexeme, new Array(size).fill(null));
    }
}

class FunctionStatement extends Statement {
    /**
     * @param {Token} name
     * @param {Token[]} params
     * @param {Statement[]} body
     */
    constructor(name, params, body) {
        super();
        this.name = name;
        this.params = params;
        this.body = body;
    }

    async execute(environment) {
        environment.define(this.name.lexeme, new OneShotFunction(this, environment));
    }
}

/**
 * IMPORT math runs lib/math.oneshot once per run, in the global scope,
 * so the functions and variables it declares can be used everywhere.
 */
class ImportStatement extends Statement {
    /**
     * @param {Token} name
     */
    constructor(name) {
        super();
        this.name = name;
    }

    async execute(environment) {
        const runtime = environment.runtime;
        const name = this.name.lexeme.toLowerCase();

        // Importing twice, or two libraries importing each other, runs each library once
        if (runtime.imported.has(name)) {
            return;
        }
        runtime.imported.add(name);

        const file = `${name}.oneshot`;
        const source = await loadLibrary(name);

        let statements;
        try {
            const tokens = new Scanner(source).scanTokens();
            statements = new Parser(tokens, file).parse();
        } catch (error) {
            error.file ??= file;
            throw error;
        }

        await executeStatements(statements, runtime.globals);
    }
}

/**
 * Folder of the libraries: lib/ next to oneShot.js, unless a page sets `OneShot.libraryUrl`
 */
let libraryUrl = typeof document !== 'undefined' && document.currentScript
    ? new URL('lib/', document.currentScript.src).href
    : 'lib/';

/**
 * Reads the source code of lib/[name].oneshot
 * @param {string} name Lower case library name
 */
async function loadLibrary(name) {
    const url = new URL(`${name}.oneshot`, new URL(libraryUrl, globalThis.location?.href)).href;

    let response;
    try {
        response = await fetch(url);
    } catch {
        throw new OneShotError(`Could not load the library ${name}. Libraries can only be loaded when the page is served over http`);
    }

    if (!response.ok) {
        throw new OneShotError(`There is no library called ${name}`);
    }

    return await response.text();
}

class ReturnStatement extends Statement {
    /**
     * @param {Expression?} value
     */
    constructor(value) {
        super();
        this.value = value;
    }

    async execute(environment) {
        const value = this.value ? await this.value.evaluate(environment) : null;
        throw new ReturnSignal(value);
    }
}

/**
 * THEN ... END, a block with its own scope
 */
class BlockStatement extends Statement {
    /**
     * @param {Statement[]} statements
     */
    constructor(statements) {
        super();
        this.statements = statements;
    }

    async execute(environment) {
        await executeStatements(this.statements, new Environment(environment));
    }
}

class IfStatement extends Statement {
    /**
     * @param {Expression} condition
     * @param {Statement[]} thenBranch
     * @param {Statement[]} elseBranch
     */
    constructor(condition, thenBranch, elseBranch) {
        super();
        this.condition = condition;
        this.thenBranch = thenBranch;
        this.elseBranch = elseBranch;
    }

    async execute(environment) {
        const condition = await this.condition.evaluate(environment);
        await executeStatements(isTruthy(condition) ? this.thenBranch : this.elseBranch, environment);
    }
}

class WhileStatement extends Statement {
    /**
     * @param {Expression} condition
     * @param {Statement[]} body
     */
    constructor(condition, body) {
        super();
        this.condition = condition;
        this.body = body;
    }

    async execute(environment) {
        const runtime = environment.runtime;

        while (isTruthy(await this.condition.evaluate(environment))) {
            await executeStatements(this.body, new Environment(environment));
            await runtime.loopTick();
        }
    }
}

class ForStatement extends Statement {
    /**
     * @param {Statement} initializer
     * @param {Expression} condition
     * @param {Statement} increment
     * @param {Statement[]} body
     */
    constructor(initializer, condition, increment, body) {
        super();
        this.initializer = initializer;
        this.condition = condition;
        this.increment = increment;
        this.body = body;
    }

    async execute(environment) {
        const runtime = environment.runtime;

        // The loop variable lives in its own scope, so it doesn't leak out of the loop
        const loopEnvironment = new Environment(environment);
        await this.initializer.execute(loopEnvironment);

        while (isTruthy(await this.condition.evaluate(loopEnvironment))) {
            await executeStatements(this.body, new Environment(loopEnvironment));
            await this.increment.execute(loopEnvironment);
            await runtime.loopTick();
        }
    }
}

class SpriteStatement extends Statement {
    /**
     * @param {Expression} name
     * @param {Statement[]} body
     */
    constructor(name, body) {
        super();
        this.name = name;
        this.body = body;
    }

    async execute(environment) {
        const runtime = environment.runtime;
        const sprite = new Sprite();
        runtime.sprites.set(await this.name.evaluate(environment), sprite);

        const previous = runtime.currentSprite;
        runtime.currentSprite = sprite;
        try {
            await executeStatements(this.body, new Environment(environment));
        } finally {
            runtime.currentSprite = previous;
        }
    }
}

class FrameStatement extends Statement {
    /**
     * @param {Expression?} name Frames can be drawn by index, so the name is optional
     * @param {Statement[]} body
     */
    constructor(name, body) {
        super();
        this.name = name;
        this.body = body;
    }

    async execute(environment) {
        const sprite = environment.runtime.requireSprite('FRAME');
        const name = this.name ? await this.name.evaluate(environment) : null;
        sprite.addFrame(name);

        await executeStatements(this.body, new Environment(environment));
    }
}

class SongStatement extends Statement {
    /**
     * @param {Expression} name
     * @param {Statement[]} body
     */
    constructor(name, body) {
        super();
        this.name = name;
        this.body = body;
    }

    async execute(environment) {
        const runtime = environment.runtime;
        const song = new Song();
        runtime.songs.set(await this.name.evaluate(environment), song);

        runtime.currentSong = song;
        try {
            await executeStatements(this.body, new Environment(environment));
        } finally {
            runtime.currentSong = null;
        }
    }
}

class SheetStatement extends Statement {
    /**
     * @param {Statement[]} body
     */
    constructor(body) {
        super();
        this.body = body;
    }

    async execute(environment) {
        const runtime = environment.runtime;
        runtime.currentSheet = runtime.requireSong('SHEET').addSheet();
        try {
            await executeStatements(this.body, new Environment(environment));
        } finally {
            runtime.currentSheet = null;
        }
    }
}


/* ==========================================================================
 * Parser: tokens → statements
 * ======================================================================= */

class Parser {

    #tokens;
    #current = 0;

    /** File name of a library, used in error messages. Undefined for the main program. */
    #file;

    /**
     * @param {Token[]} tokens
     * @param {string} [file]
     */
    constructor(tokens, file) {
        this.#tokens = tokens;
        this.#file = file;
    }

    parse() {
        const statements = [];

        while (!this.#isAtEnd()) {
            statements.push(this.#declaration());
        }

        return statements;
    }

    #declaration() {
        const line = this.#peek().line;

        let statement;
        if (this.#match(TokenType.FUNC)) {
            statement = this.#funcDeclaration();
        } else if (this.#match(TokenType.LET)) {
            statement = this.#letDeclaration();
        } else if (this.#match(TokenType.IMPORT)) {
            statement = new ImportStatement(this.#consume(TokenType.IDENTIFIER, 'Expected a library name after IMPORT, like IMPORT math'));
        } else {
            statement = this.#statement();
        }

        statement.line = line;
        statement.file = this.#file;
        return statement;
    }

    #funcDeclaration() {
        const name = this.#consume(TokenType.IDENTIFIER, 'Functions need a name');
        this.#consume(TokenType.LEFT_P, 'Expected ( after function name');

        const params = [];
        if (!this.#check(TokenType.RIGHT_P)) {
            do {
                params.push(this.#consume(TokenType.IDENTIFIER, 'Expected parameter name'));
            } while (this.#match(TokenType.COMMA));
        }

        this.#consume(TokenType.RIGHT_P, 'Expected ) after parameters');
        this.#consume(TokenType.THEN, 'Expected THEN after parameters');

        return new FunctionStatement(name, params, this.#block('FUNC'));
    }

    #letDeclaration() {
        const name = this.#consume(TokenType.IDENTIFIER, 'Expected variable name');

        if (this.#match(TokenType.LEFT_B)) {
            const size = this.#expression();
            this.#consume(TokenType.RIGHT_B, 'Missing bracket ]');
            return new LetArrayStatement(name, size);
        }

        const initializer = this.#match(TokenType.EQUAL) ? this.#expression() : null;
        return new LetStatement(name, initializer);
    }

    #statement() {
        const keyword = this.#peek();

        if (COMMANDS.has(keyword.type)) {
            this.#advance();
            return this.#command(keyword, COMMANDS.get(keyword.type));
        }

        if (this.#match(TokenType.RETURN)) return this.#returnStatement();
        if (this.#match(TokenType.THEN)) return new BlockStatement(this.#block('THEN'));
        if (this.#match(TokenType.IF)) return this.#ifStatement();
        if (this.#match(TokenType.WHILE)) return this.#whileStatement();
        if (this.#match(TokenType.FOR)) return this.#forStatement();
        if (this.#match(TokenType.SPRITE)) return new SpriteStatement(this.#expression(), this.#block('SPRITE'));
        if (this.#match(TokenType.FRAME)) return this.#frameStatement();
        if (this.#match(TokenType.SONG)) return new SongStatement(this.#expression(), this.#block('SONG'));
        if (this.#match(TokenType.SHEET)) return new SheetStatement(this.#block('SHEET'));

        return new ExpressionStatement(this.#expression());
    }

    /**
     * Parses the comma-separated arguments of a command
     * @param {Token} keyword
     */
    #command(keyword, command) {
        if (keyword.type === TokenType.FILL && this.#match(TokenType.ALL)) {
            return new CommandStatement(FILL_ALL_COMMAND, []);
        }

        const args = [];
        for (let i = 0; i < command.arity; i++) {
            if (i > 0) {
                this.#consume(TokenType.COMMA, `Missing comma. Usage: ${command.usage}`);
            }
            args.push(this.#expression());
        }

        return new CommandStatement(command, args);
    }

    /**
     * Parses statements until END, and consumes the END
     * @param {string} opener Keyword that opened the block, for the error message
     */
    #block(opener) {
        const statements = this.#statementsUntil(TokenType.END);
        this.#consume(TokenType.END, `Expected END to close ${opener}`);
        return statements;
    }

    #statementsUntil(...terminators) {
        const statements = [];

        while (!terminators.some(type => this.#check(type)) && !this.#isAtEnd()) {
            statements.push(this.#declaration());
        }

        return statements;
    }

    #returnStatement() {
        this.#consume(TokenType.LEFT_P, 'RETURN needs parentheses: RETURN (value) or RETURN ()');
        const value = this.#check(TokenType.RIGHT_P) ? null : this.#expression();
        this.#consume(TokenType.RIGHT_P, 'Missing enclosing )');

        return new ReturnStatement(value);
    }

    #ifStatement() {
        const condition = this.#expression();
        this.#consume(TokenType.THEN, 'Expected THEN after IF condition');

        const thenBranch = this.#statementsUntil(TokenType.END, TokenType.ELSE);
        const elseBranch = this.#match(TokenType.ELSE) ? this.#statementsUntil(TokenType.END) : [];
        this.#consume(TokenType.END, 'Expected END to close IF');

        return new IfStatement(condition, thenBranch, elseBranch);
    }

    #whileStatement() {
        const condition = this.#expression();
        this.#consume(TokenType.THEN, 'Expected THEN after WHILE condition');

        return new WhileStatement(condition, this.#block('WHILE'));
    }

    /**
     * FOR (initializer : condition : increment) THEN ... END
     */
    #forStatement() {
        const hasParentheses = this.#match(TokenType.LEFT_P);

        const initializer = this.#declaration();
        this.#consume(TokenType.COLON, 'Missing colon. Usage: FOR (LET I = 0 : I < 10 : I++) THEN');
        const condition = this.#expression();
        this.#consume(TokenType.COLON, 'Missing colon. Usage: FOR (LET I = 0 : I < 10 : I++) THEN');
        const increment = this.#declaration();

        if (hasParentheses) {
            this.#consume(TokenType.RIGHT_P, 'Missing enclosing ) in FOR');
        }
        this.#consume(TokenType.THEN, 'Expected THEN to start FOR block');

        return new ForStatement(initializer, condition, increment, this.#block('FOR'));
    }

    #frameStatement() {
        // The name is optional: FRAME "WALK" ... END or just FRAME ... END
        const hasName = this.#check(TokenType.STRING) || this.#check(TokenType.IDENTIFIER);
        const name = hasName ? this.#expression() : null;

        return new FrameStatement(name, this.#block('FRAME'));
    }

    #expression() {
        return this.#assignment();
    }

    #assignment() {
        const expression = this.#or();

        if (this.#match(TokenType.EQUAL)) {
            const equals = this.#previous();
            const value = this.#assignment();

            if (expression instanceof VariableExpression) {
                return new AssignmentExpression(expression, value);
            }

            throw this.#error('Invalid assignment target', equals);
        }

        return expression;
    }

    #or() {
        let expression = this.#and();

        while (this.#match(TokenType.OR)) {
            expression = new LogicalExpression(expression, this.#previous(), this.#and());
        }

        return expression;
    }

    #and() {
        let expression = this.#binary(0);

        while (this.#match(TokenType.AND)) {
            expression = new LogicalExpression(expression, this.#previous(), this.#binary(0));
        }

        return expression;
    }

    /**
     * Binary operators, from the lowest precedence to the highest
     */
    static #binaryPrecedence = [
        [TokenType.EQUAL_EQUAL, TokenType.NOT_EQUAL],
        [TokenType.GREATER, TokenType.GREATER_EQUAL, TokenType.LESS, TokenType.LESS_EQUAL],
        [TokenType.PLUS, TokenType.MINUS],
        [TokenType.STAR, TokenType.SLASH, TokenType.MOD],
    ];

    /**
     * Parses left-associative binary operators of the given precedence level and above
     * @param {number} level Index into #binaryPrecedence
     */
    #binary(level) {
        if (level === Parser.#binaryPrecedence.length) {
            return this.#unary();
        }

        let expression = this.#binary(level + 1);

        while (this.#match(...Parser.#binaryPrecedence[level])) {
            expression = new BinaryExpression(expression, this.#previous(), this.#binary(level + 1));
        }

        return expression;
    }

    #unary() {
        if (this.#match(TokenType.NOT, TokenType.MINUS)) {
            return new UnaryExpression(this.#previous(), this.#unary());
        }

        if (this.#match(TokenType.PLUSPLUS, TokenType.MINUSMINUS)) {
            const operator = this.#previous();
            return new UpdateExpression(this.#updateTarget(this.#unary(), operator), operator, true);
        }

        return this.#postfix();
    }

    #postfix() {
        const expression = this.#call();

        if (this.#match(TokenType.PLUSPLUS, TokenType.MINUSMINUS)) {
            const operator = this.#previous();
            return new UpdateExpression(this.#updateTarget(expression, operator), operator, false);
        }

        return expression;
    }

    #updateTarget(expression, operator) {
        if (!(expression instanceof VariableExpression)) {
            throw this.#error(`${operator.lexeme} can only be used on variables and array elements`, operator);
        }

        return expression;
    }

    #call() {
        let expression = this.#primary();

        while (this.#match(TokenType.LEFT_P)) {
            const paren = this.#previous();
            expression = new CallExpression(expression, paren, this.#arguments());
        }

        return expression;
    }

    /**
     * Parses a comma-separated argument list after the opening (, including the closing )
     */
    #arguments() {
        const args = [];

        if (!this.#check(TokenType.RIGHT_P)) {
            do {
                args.push(this.#expression());
            } while (this.#match(TokenType.COMMA));
        }

        this.#consume(TokenType.RIGHT_P, 'Expected ) after arguments');
        return args;
    }

    #primary() {
        if (this.#match(TokenType.FALSE)) return new LiteralExpression(false);
        if (this.#match(TokenType.TRUE)) return new LiteralExpression(true);
        if (this.#match(TokenType.NULL)) return new LiteralExpression(null);

        if (this.#match(TokenType.STRING, TokenType.NUMBER)) {
            return new LiteralExpression(this.#previous().literal);
        }

        if (this.#match(TokenType.IDENTIFIER)) {
            const name = this.#previous();

            if (this.#match(TokenType.LEFT_B)) {
                const index = this.#expression();
                this.#consume(TokenType.RIGHT_B, 'Missing bracket ]');
                return new VariableExpression(name, index);
            }

            return new VariableExpression(name);
        }

        if (this.#match(TokenType.LEFT_P)) {
            const expression = this.#expression();
            this.#consume(TokenType.RIGHT_P, 'Missing enclosing parenthesis');
            return expression;
        }

        const keyword = this.#peek();

        if (BUILTIN_VALUES.has(keyword.type)) {
            this.#advance();
            return new BuiltinCallExpression(keyword, BUILTIN_VALUES.get(keyword.type), []);
        }

        if (BUILTINS.has(keyword.type)) {
            this.#advance();
            const builtin = BUILTINS.get(keyword.type);

            this.#consume(TokenType.LEFT_P, `Expected ( after ${keyword.lexeme}`);
            const args = this.#arguments();
            if (args.length !== builtin.arity) {
                throw this.#error(`${keyword.lexeme} expects ${builtin.arity} argument(s) but got ${args.length}`, keyword);
            }

            return new BuiltinCallExpression(keyword, builtin, args);
        }

        throw this.#error(keyword.type === TokenType.EOF ? 'Unexpected end of program' : `Unexpected '${keyword.lexeme}'`);
    }

    #match(...types) {
        for (const type of types) {
            if (this.#check(type)) {
                this.#advance();
                return true;
            }
        }

        return false;
    }

    #check(type) {
        return this.#peek().type === type;
    }

    #advance() {
        if (!this.#isAtEnd()) {
            this.#current++;
        }

        return this.#previous();
    }

    #isAtEnd() {
        return this.#peek().type === TokenType.EOF;
    }

    #peek() {
        return this.#tokens[this.#current];
    }

    #previous() {
        return this.#tokens[this.#current - 1];
    }

    #consume(type, errorMessage) {
        if (this.#check(type)) {
            return this.#advance();
        }

        throw this.#error(errorMessage);
    }

    #error(message, token = this.#peek()) {
        // At the end of the program, point at the last real token instead of the trailing newlines
        if (token.type === TokenType.EOF && this.#current > 0) {
            token = this.#previous();
        }

        return new OneShotError(message, token.line);
    }
}


/* ==========================================================================
 * OneShot: the public API
 * ======================================================================= */

class OneShot {

    /**
     * @type {HTMLCanvasElement?}
     */
    #canvas = null;

    /**
     * Runtime of the program that is currently running
     * @type {Runtime?}
     */
    #runtime = null;

    /**
     * @param {string} [canvasId] Id of the canvas to draw on. Without it, WINDOW creates a canvas.
     */
    constructor(canvasId) {
        if (canvasId) {
            this.#canvas = document.getElementById(canvasId);
        }
    }

    onPrint = (message) => {
        console.log(message);
    }

    /**
     * @param {Error} error
     */
    onError = (error) => {
        console.error(OneShot.formatError(error));
    }

    /**
     * @param {Error} error
     */
    static formatError(error) {
        if (error.line === undefined) {
            return error.file ? `[${error.file}] ${error.message}` : error.message;
        }

        return error.file ? `[${error.file}, line ${error.line}] ${error.message}` : `[Line ${error.line}] ${error.message}`;
    }

    /** URL of the folder IMPORT loads libraries from. By default it is lib/ next to oneShot.js. */
    static get libraryUrl() {
        return libraryUrl;
    }

    static set libraryUrl(url) {
        libraryUrl = url.endsWith('/') ? url : `${url}/`;
    }

    /**
     * Runs a program, stopping the one that is already running. Errors are reported to `onError`.
     * @param {string} source
     */
    async run(source) {
        this.stop();

        const runtime = new Runtime(this.#canvas, message => this.onPrint(message));
        this.#runtime = runtime;
        input.canvas = this.#canvas;
        input.capturing = true;

        try {
            const tokens = new Scanner(source).scanTokens();
            const statements = new Parser(tokens).parse();
            await executeStatements(statements, runtime.globals);
        } catch (error) {
            if (!(error instanceof StopSignal)) {
                this.onError(error);
            }
        } finally {
            // WINDOW may have created a canvas, reuse it next time
            this.#canvas = runtime.canvas;

            if (this.#runtime === runtime) {
                this.#runtime = null;
                input.capturing = false;
            }
        }
    }

    /**
     * Stops the running program and its songs, and clears the screen.
     */
    stop() {
        this.#runtime?.stop();
        this.#runtime = null;

        const canvas = this.#canvas;
        if (canvas) {
            canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        }
    }
}
