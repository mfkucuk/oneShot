/*
 * OneShot is a sequential programming language used to
 * make games. This file is the interpreter for this language
 * written in pure vanilla JavaScript. 
 */


// Global Variables
/**
 * @type {HTMLCanvasElement}
 */
let canvas = null;

/**
 * @type {CanvasRenderingContext2D}
 */
let ctx = null;

/**
 * @type {AudioContext}
 */
let audioContext = new (window.AudioContext || window.webkitAudioContext)();

// TODO: This is horrible, find another way
let running = false;

// Helper Functions
/**
 * Pause execution for [ms] milliseconds
 * @param {number} ms
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Returns if a object is truthy or falsy in OneShot
 * @param {any} object 
 * @returns {boolean}
 */
function isTruthy(object) {
    if (object == null) {
        return false;
    }

    if (typeof object == 'boolean') {
        return object;
    }

    return true;
}

// Extension methods
HTMLCanvasElement.prototype.setup = function() {
    this.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });
}

/* OneShot classes */

// Input
class Input {
    /**
     * @type {Map<string, boolean>}
     */
    keyDownMap;
    
    constructor() {
        this.keyDownMap = {};

        this.mouseX = 0;
        this.mouseY = 0;

        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('mousemove', this.onMouseMove);
    }

    /**
     * @param {string} key 
     */
    getKey(key) {
        key = key.toLocaleUpperCase();
        if (typeof this.keyDownMap[key] == 'undefined') {
            this.keyDownMap[key] = false;
        }

        return this.keyDownMap[key];
    }

    /**
     * @param {KeyboardEvent} event 
     */
    onKeyDown(event) {
        this.keyDownMap[event.key.toLocaleUpperCase()] = true;
    }

    /**
     * @param {KeyboardEvent} event 
     */
    onKeyUp(event) {
        this.keyDownMap[event.key.toLocaleUpperCase()] = false;
    }

    /**
     * @param {MouseEvent} event 
     */
    onMouseMove(event) {
        const rect = canvas?.getBoundingClientRect();
        this.mouseX = event.x - rect?.left;
        this.mouseY = event.y - rect?.top;
    }
}

// Rendering
class Sprite {
    
    sizeX;
    sizeY;

    /**
     * @type {Frame[]}
     */
    frames;

    /**
     * @type {Map<string, Frame>}
     */
    frameMap;
    frameIndex;

    constructor() {
        this.frames = [];
        this.frameMap = new Map();
        this.frameIndex = -1;
    }

    get currentFrame() {
        return this.frames[this.frameIndex];
    }

    set currentFrame(frame) {
        this.frames[this.frameIndex] = frame;
        this.frameMap.set(this.frames[this.frameIndex].frameName, this.frames[this.frameIndex]);
    }
}

class Frame {

    colorData;
    pixelData;

    constructor(frameName) {
        this.colorData = new Map();
        this.pixelData = [];


        this.frameName = frameName;
    }

}

// BGM & SFX
class Song extends GainNode {
    
    /**
     * @param {BaseAudioContext} ctx 
     */
    constructor(ctx) {
        super(ctx);

        this.ctx = ctx;
        this.sheets = [];
        this.bpm = 120;
        this.loop = false;
    }

    get currentSheet() {
        if (this.sheets.length == 0) {
            return null;
        }

        return this.sheets[this.sheets.length - 1];
    }

    /**
     * 
     * @param {Sheet} sheet 
     */
    addSheet(sheet) {
        sheet.index = this.sheets.length;
        this.sheets.push(sheet);
    }

    async play() {
        const promises = [];

        for (const sheet of this.sheets) {
            promises.push(sheet.play());
        }

        await Promise.all(promises);
    }

    stop() {
        for (const sheet of this.sheets) {
            sheet.stop();
        }
    }
}

class Sheet {

    /**
     * @param {Song} song 
     */
    constructor(song) {
        this.song = song;
        this.index = -1;
        this.bars = '';
        this.notes = [];
        this.gain = 0.8;
        this.type = 'sine';
        this.attack = 2;
        this.release = 20;
    }

    build() {
        const sheetNotes = this.bars.trim()
            .replaceAll("\r", " ")
            .replaceAll("\n", " ")
            .replaceAll("\t", " ")
            .split(" ");

        for (const sheetNote of sheetNotes) {
            if (sheetNote == '--') {
                const previousNote = this.notes[this.notes.length - 1];
                if (previousNote && previousNote.note == '--') {
                    previousNote.length++;
                    continue;
                }

                const note = new Note();
                note.sheet = this;
                this.notes.push(note);
                continue;
            } 
            
            if (sheetNote == '..') {
                const previousNote = this.notes[this.notes.length - 1];
                previousNote.length++;
                continue;
            }

            const note = new Note(sheetNote, this);
            this.notes.push(note);
        }
    }

    async play() {
        this.build();

        const song = this.song;
        const ctx = song.ctx;

        this.node = ctx.createGain();
        this.node.gain.value = this.gain;
        this.node.connect(song);

        let index = 0;
        this.playing = true;

        while (this.playing) {
            await this.notes[index++].play();
            if (index == this.notes.length) {
                if (song.loop) {
                    index = 0;
                    continue;
                }
                break;
            }
        }

        await sleep(5000);

        this.node.disconnect();
    }

    stop() {
        this.playing = false;
    }
}

class Note {

    static noteOffsets = {
        C: -9,
        D: -7,
        E: -5,
        F: -4,
        G: -2,
        A: 0,
        B: 2,
    };
    
    constructor(note, sheet) {
        this.note = note;
        this.length = 1;

        this.sheet = sheet;
    }

    /**
     * Converts a note (letter-number combination) into its frequency value.
     * @param {string} note 
     */
    #getFrequency(note) {
        const letter = note[0].toUpperCase();
        const octave = parseInt(note[1], 10);

        const semitonesFromA4 = Note.noteOffsets[letter] + (octave - 4) * 12;

        const frequency = 440 * Math.pow(2, semitonesFromA4 / 12);
        return frequency;
    }

    async play() {

        const sheet = this.sheet;
        const song = sheet.song;

        const length = this.length * (120 / song.bpm);

        let oscillator = null;
        let gainNode = null;

        if (this.note) {
            const ctx = song.ctx;
            const time = ctx.currentTime;
            const gain = sheet.gain;

            const attack = Math.min(length / 2, sheet.attack / 1000);
            const release = Math.min(length / 2, sheet.release / 1000);

            gainNode = ctx.createGain();

            gainNode.gain.setValueAtTime(0, time);
            gainNode.gain.linearRampToValueAtTime(gain, time + attack);

            gainNode.gain.setValueAtTime(gain, time + length - release);
            gainNode.gain.linearRampToValueAtTime(0, time + length);

            gainNode.connect(ctx.destination);

            oscillator = ctx.createOscillator();
            oscillator.type = sheet.type;
            oscillator.frequency.value = this.#getFrequency(this.note);
            oscillator.connect(gainNode);
            oscillator.start();
        }

        await sleep(length * 1100);

        if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
            oscillator = undefined;
        }

        if (gainNode) {
            gainNode.disconnect(ctx.destination);
            gainNode = undefined;
        }
    }
}

const input = new Input();

// Beyond here is interpreter related
/**
 * All the allowed tokens in OneShot
 */
const TokenType = {
    // Single character token types
    LEFT_P: 0, RIGHT_P: 0, COLON: 0,
    COMMA: 0, MINUS: 0, PLUS: 0, 
    SLASH: 0, STAR: 0, HASHTAG: 0,
    
    // One or two character token types
    NOT: 0, NOT_EQUAL: 0,
    EQUAL: 0, EQUAL_EQUAL: 0,
    GREATER: 0, GREATER_EQUAL: 0,
    LESS: 0, LESS_EQUAL: 0,

    // Literal token types
    IDENTIFIER: 0, STRING: 0, NUMBER: 0,

    // Keyword token types
    AND: 0, OR: 0, TRUE: 0, FALSE: 0,
    IF: 0, ELSE: 0, FOR: 0, WHILE: 0, END: 0, THEN: 0,
    LET: 0, FUN: 0, NULL: 0, ALL: 0, MOUSEX: 0, MOUSEY: 0,

    // Built-in function token types
    DEBUG: 0, PRINT: 0, WINDOW: 0, COLOR: 0,
    FILL: 0, TEXT: 0, SLEEP: 0, DRAW: 0, RANDOM: 0,
    INPUT: 0, INT: 0, MIN: 0, MAX: 0, ABS: 0,
    FLOOR: 0, CEIL: 0, LERP: 0,

    // Sprite
    SPRITE: 0, SIZE: 0, FRAME: 0, 
    COLORDATA: 0, PIXELDATA: 0,

    // BGM & SFX
    SONG: 0, SHEET: 0, BAR: 0, GAIN: 0,
    BPM: 0, LOOP: 0, TYPE: 0, PLAY: 0, STOP: 0,


    EOF: 0
};


let tokenIndex = 0;
for (const tokenType of Object.keys(TokenType)) {
    TokenType[tokenType] = tokenIndex;
    tokenIndex++;
}

class Token {
    
    #type;
    #lexeme;
    #literal;
    #line;

    constructor(type, lexeme, literal, line) {
        this.#type = type;
        this.#lexeme = lexeme;
        this.#literal = literal;
        this.#line = line;
    }

    get type() {
        return this.#type;
    }

    get lexeme() {
        return this.#lexeme;
    }

    get literal() {
        return this.#literal;
    }

    get line() {
        return this.#line;
    }
}

class Scanner {
    
    static #keywords = new Map([
        ['AND', TokenType.AND],
        ['OR', TokenType.OR],
        ['TRUE', TokenType.TRUE],
        ['FALSE', TokenType.FALSE],
        ['IF', TokenType.IF],
        ['ELSE', TokenType.ELSE],
        ['FOR', TokenType.FOR],
        ['WHILE', TokenType.WHILE],
        ['END', TokenType.END],
        ['THEN', TokenType.THEN],
        ['LET', TokenType.LET],
        ['FUN', TokenType.FUN],
        ['NULL', TokenType.NULL],
        ['ALL', TokenType.ALL],
        ['MOUSEX', TokenType.MOUSEX],
        ['MOUSEY', TokenType.MOUSEY],
        ['DEBUG', TokenType.DEBUG],
        ['PRINT', TokenType.PRINT],
        ['WINDOW', TokenType.WINDOW],
        ['COLOR', TokenType.COLOR],
        ['FILL', TokenType.FILL],
        ['TEXT', TokenType.TEXT],
        ['SLEEP', TokenType.SLEEP],
        ['UPDATE', TokenType.UPDATE],
        ['SPRITE', TokenType.SPRITE],
        ['SIZE', TokenType.SIZE],
        ['DRAW', TokenType.DRAW],
        ['RANDOM', TokenType.RANDOM],
        ['INPUT', TokenType.INPUT],
        ['INT', TokenType.INT],
        ['MIN', TokenType.MIN],
        ['MAX', TokenType.MAX],
        ['ABS', TokenType.ABS],
        ['FLOOR', TokenType.FLOOR],
        ['CEIL', TokenType.CEIL],
        ['LERP', TokenType.LERP],
        ['FRAME', TokenType.FRAME],
        ['COLORDATA', TokenType.COLORDATA],
        ['PIXELDATA', TokenType.PIXELDATA],
        ['SONG', TokenType.SONG],
        ['SHEET', TokenType.SHEET],
        ['BAR', TokenType.BAR],
        ['GAIN', TokenType.GAIN],
        ['BPM', TokenType.BPM],
        ['LOOP', TokenType.LOOP],
        ['TYPE', TokenType.TYPE],
        ['PLAY', TokenType.PLAY],
        ['STOP', TokenType.STOP],
    ]);

    #source;
    #tokens;
    #start;
    #current;
    #line;

    /**
     * @param {string} source 
     */
    constructor(source) {
        this.#source = source;
        this.#tokens = [];
        this.#start = 0;
        this.#current = 0;
        this.#line = 1;
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
            case ':': this.#addToken(TokenType.COLON); break;
            case ',': this.#addToken(TokenType.COMMA); break;
            case '-': this.#addToken(TokenType.MINUS); break;
            case '+': this.#addToken(TokenType.PLUS); break;
            case '/': this.#addToken(TokenType.SLASH); break;
            case '*': this.#addToken(TokenType.STAR); break;
            case '!': this.#addToken(TokenType.NOT); break;
            case '=': 
                this.#addToken(this.#match('=') ? TokenType.EQUAL_EQUAL : TokenType.EQUAL);
                break;
            
            case '>':
                this.#addToken(this.#match('=') ? TokenType.GREATER_EQUAL : TokenType.GREATER);
                break;

            case '<':
                if (this.#match('=')) {
                    this.#addToken(TokenType.LESS_EQUAL);
                    return;
                } else if (this.#match('>')) {
                    this.#addToken(TokenType.NOT_EQUAL);
                    return;
                }

                this.#addToken(TokenType.LESS);
                break;

            case '#':
                while (this.#peek() != '\n' && !this.#isAtEnd()) {
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
                } 
                else {
                    throw new SyntaxError(`[Line ${this.#line}]: Unexpected character.`);
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

    #addToken(type, literal) {
        const text = this.#source.substring(this.#start, this.#current);
        this.#tokens.push(new Token(type, text, literal, this.#line));
    }

    #match(expectedChar) {
        if (this.#isAtEnd()) {
            return false;
        }

        if (this.#source.charAt(this.#current) != expectedChar) {
            return false;
        }

        this.#current++;
        return true;
    }

    #peek() {
        if (this.#isAtEnd()) {
            return '\0';
        }

        return this.#source.charAt(this.#current);
    }

    #peekNext() {
        if (this.#current + 1 > this.#source.length) {
            return '\0';
        }

        return this.#source.charAt(this.#current + 1);
    }

    #string() {
        while (this.#peek() != '"' && !this.#isAtEnd()) {
            this.#advance();
        }

        if (this.#isAtEnd()) {
            throw new SyntaxError(`[Line ${this.#line}]: Unterminated string`);
        }

        this.#advance();

        const value = this.#source.substring(this.#start + 1, this.#current - 1);
        this.#addToken(TokenType.STRING, value);
    }

    #number() {
        while (this.#isDigit(this.#peek())) {
            this.#advance();
        }

        if (this.#peek() == '.' && this.#isDigit(this.#peekNext())) {
            this.#advance();

            while (this.#isDigit(this.#peek())) {
                this.#advance();
            }
        }

        const value = parseFloat(this.#source.substring(this.#start, this.#current));
        this.#addToken(TokenType.NUMBER, value);
    }

    #identifier() {
        while (this.#isAlphaNumberic(this.#peek())) {
            this.#advance();
        }

        const text = this.#source.substring(this.#start, this.#current);
        let type = Scanner.#keywords.get(text);
        if (!type) {
            type = TokenType.IDENTIFIER;
        }
        this.#addToken(type);
    }

    #isDigit(c) {
        return c >= '0' && c <= '9';
    }

    #isAlpha(c) {
        return (c >= 'a' && c <= 'z') ||
               (c >= 'A' && c <= 'Z') ||
               c == '_';
    }

    #isAlphaNumberic(c) {
        return this.#isAlpha(c) || this.#isDigit(c);
    }
}

class Expression {
    /**
     * @param {Environment} expression 
     */
    interpret(environment) {}
    resolve() {}
    analyse() {}
}

class AssignmentExpression extends Expression {
    
    name;
    value;

    /**
     * @param {Token} name 
     * @param {Expression} value 
     */
    constructor(name, value) {
        super();

        this.name = name;
        this.value = value;
    }

    interpret(environment) {
        const value = this.value.interpret(environment);
        environment.assign(this.name, value);
        return null;
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

    interpret(environment) {
        const leftValue = this.left.interpret(environment);
        const rightValue = this.right.interpret(environment);

        switch (this.operator.type) {
            case TokenType.MINUS:
                this.#checkNumberOperands(leftValue, rightValue);
                return parseFloat(leftValue) - parseFloat(rightValue);
            case TokenType.SLASH:
                this.#checkNumberOperands(leftValue, rightValue);
                return parseFloat(leftValue) / parseFloat(rightValue);
            case TokenType.STAR:
                this.#checkNumberOperands(leftValue, rightValue);
                return parseFloat(leftValue) * parseFloat(rightValue);

            case TokenType.PLUS:
                if (typeof leftValue == 'number' && typeof rightValue == 'number') {
                    return parseFloat(leftValue) + parseFloat(rightValue);
                }

                if (typeof leftValue == 'string' && typeof rightValue == 'string') {
                    return leftValue + rightValue;
                }

                if (typeof leftValue == 'string' && typeof rightValue == 'number') {
                    return leftValue + `${rightValue}`;
                }

                if (typeof leftValue == 'number' && typeof rightValue == 'string') {
                    return `${leftValue}` + rightValue;
                }

                break;

            case TokenType.GREATER:
                this.#checkNumberOperands(leftValue, rightValue);
                return parseFloat(leftValue) > parseFloat(rightValue);
            case TokenType.GREATER_EQUAL:
                this.#checkNumberOperands(leftValue, rightValue);
                return parseFloat(leftValue) >= parseFloat(rightValue);
            case TokenType.LESS:
                this.#checkNumberOperands(leftValue, rightValue);
                return parseFloat(leftValue) < parseFloat(rightValue);
            case TokenType.LESS_EQUAL:
                this.#checkNumberOperands(leftValue, rightValue);
                return parseFloat(leftValue) <= parseFloat(rightValue);

            case TokenType.EQUAL_EQUAL: return this.#isEqual(leftValue, rightValue);
            case TokenType.NOT_EQUAL: return !this.#isEqual(leftValue, rightValue);
        }

        return null;
    }

    #isEqual(a, b) {
        if (a == null && b == null) {
            return true;
        }

        if (a == null) {
            return false;
        }

        return a === b;
    }

    #checkNumberOperands(left, right) {
        if (typeof left == 'number' && typeof right == 'number') {
            return;
        }

        throw new Error('Operands must be numbers');
    }
}

class GroupingExpression extends Expression {
    /**
     * @param {Expression} expr 
     */
    constructor(expr) {
        super();
        
        this.expr = expr;
    }

    interpret(environment) {
        return this.expr.interpret(environment);
    }
}

class LiteralExpression extends Expression { 
    constructor(value) {
        super();

        this.value = value;
    }

    interpret(environment) {
        return this.value;
    }
}

class LogicalExpression extends Expression {
    /**
     * 
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

    interpret(environment) {
        const leftValue = this.left.interpret(environment);

        if (this.operator.type == TokenType.OR) {
            if (isTruthy(leftValue)) {
                return leftValue;
            }
        } else {
            if (!isTruthy(leftValue)) {
                return leftValue;
            }
        }

        return this.right.interpret(environment);
    }
}

class UnaryExpression extends Expression {
    /**
     * 
     * @param {Token} token 
     * @param {Expression} right 
     */
    constructor(token, right) {
        super();

        this.token = token;
        this.right = right;
    }

    interpret(environment) {
        const rightValue = this.right.interpret(environment);

        switch (this.token.type) {
            case TokenType.MINUS:
                this.#checkNumber(rightValue);
                return -parseFloat(rightValue);

            case TokenType.NOT:
                return !isTruthy(rightValue);
        }

        return null;
    }

    #checkNumber(value) {
        if (typeof value == 'number') {
            return;
        }

        throw new Error(`Operand must be a number`)
    }
}

class VariableExpression extends Expression {
    /**
     * @param {Token} name 
     */
    constructor(name) {
        super();

        this.name = name;
    }

    interpret(environment) {
        return environment.get(this.name)
    }
}

class RandomExpression extends Expression {

    interpret(environment) {
        return Math.random();
    }
}

class InputExpression extends Expression {
    /**
     * @param {Expression} key 
     */
    constructor(key) {
        super();

        this.key = key;
    }

    interpret(environment) {
        return input.getKey(this.key.interpret(environment));
    }
}

class IntExpression extends Expression {
    /**
     * @param {Expression} number 
     */
    constructor(number) {
        super();

        this.number = number;
    }

    interpret(environment) {
        return Number(this.number.interpret(environment));
    }
}

class MinExpression extends Expression {
    /**
     * @param {Expression} value1 
     * @param {Expression} value2 
     */
    constructor(value1, value2) {
        super();

        this.value1 = value1;
        this.value2 = value2;
    }

    interpret(environment) {
        return Math.min(this.value1.interpret(environment), this.value2.interpret(environment));
    }
}

class MaxExpression extends Expression {
    /**
     * @param {Expression} value1 
     * @param {Expression} value2 
     */
    constructor(value1, value2) {
        super();

        this.value1 = value1;
        this.value2 = value2;
    }

    interpret(environment) {
        return Math.max(this.value1.interpret(environment), this.value2.interpret(environment));
    }
}

class AbsoluteExpression extends Expression {
    /**
     * @param {Expression} number 
     */
    constructor(number) {
        super();

        this.number = number;
    }

    interpret(environment) {
        return Math.abs(this.number.interpret(environment));
    }
}

class FloorExpression extends Expression {
    /**
     * @param {Expression} number 
     */
    constructor(number) {
        super();

        this.number = number;
    }

    interpret(environment) {
        return Math.floor(this.number.interpret(environment));
    }
}

class CeilExpression extends Expression {
    /**
     * @param {Expression} number 
     */
    constructor(number) {
        super();

        this.number = number;
    }

    interpret(environment) {
        return Math.ceil(this.number.interpret(environment));
    }
}

class LerpExpression extends Expression {
    /**
     * @param {Expression} a 
     * @param {Expression} b 
     * @param {Expression} t 
     */
    constructor(a, b, t) {
        super();

        this.a = a;
        this.b = b;
        this.t = t;
    }

    interpret(environment) {
        return (1 - this.t.interpret(environment)) * this.a.interpret(environment) 
            + this.t.interpret(environment) * this.b.interpret(environment);
    }
}

class MouseXExpression extends Expression {
    interpret(environment) {
        return input.mouseX;
    }
}

class MouseYExpression extends Expression {
    interpret(environment) {
        return input.mouseY;
    }
}

class Statement {
    /**
     * @param {Environment} environment 
     */
    async interpret(environment) {}
}

class BlockStatement extends Statement {
    /**
     * @param {Statement[]} statements 
     */
    constructor(statements) {
        super();

        this.statements = statements; 
    }

    async interpret(environment) {
        await this.executeBlock(new Environment(environment));
    }

    /**
     * @param {Statement[]} statements 
     * @param {Environment} environment 
     */
    async executeBlock(environment) {
        for (const statement of this.statements) {
            await statement.interpret(environment);
        }
    }
}

class ExpressionStatement extends Statement {

    expr;

    /**
     * @param {Expression} expr 
     */
    constructor(expr) {
        super();

        this.expr = expr; 
    }

    async interpret(environment) {
        this.expr.interpret(environment);
        return null;
    }
}

class LetStatement extends Statement {
    name;
    initializer;

    /**
     * @param {Token} name 
     * @param {Expression} initializer 
     */
    constructor(name, initializer) {
        super();

        this.name = name;
        this.initializer = initializer;
    }

    async interpret(environment) {
        let value = null;
        if (this.initializer != null) {
            value = this.initializer.interpret(environment);
        }

        environment.define(this.name.lexeme, value);
        return null;
    }
}

class DebugStatement extends Statement {

    expr;

    /**
     * @param {Expression} expr 
     */
    constructor(expr) {
        super();

        this.expr = expr; 
    }

    async interpret(environment) {
        console.log(this.expr.interpret(environment));
        return null;
    }
}

class PrintStatement extends Statement {

    #printCallback;
    expr

    /**
     * @param {Expression} expr 
     */
    constructor(expr, printCallback) {
        super();

        this.#printCallback = printCallback;
        this.expr = expr; 
    }

    async interpret(environment) {
        this.#printCallback(this.expr.interpret(environment));
        return null;
    }
}

class WindowStatement extends Statement {

    widthExpression;
    heightExpression;

    /**
     * @param {Expression} widthExpression 
     * @param {Expression} heightExpression 
     */
    constructor(widthExpression, heightExpression) {
        super();

        this.widthExpression = widthExpression;
        this.heightExpression = heightExpression;
    }

    async interpret(environment) {
        if (!canvas) {
            canvas = document.createElement('canvas');
            document.body.appendChild(canvas);
        }

        canvas.setup();

        ctx = canvas.getContext('2d');

        canvas.width = this.widthExpression.interpret(environment);
        canvas.height = this.heightExpression.interpret(environment);

        return null;
    }

}

class ColorStatement extends Statement {

    colorExpression;

    /**
     * @param {Expression} colorExpression 
     */
    constructor(colorExpression) {
        super();

        this.colorExpression = colorExpression;
    }

    async interpret(environment) {
        ctx.fillStyle = this.colorExpression.interpret(environment);
        return null;
    }
}

class FillStatement extends Statement {

    xExpression;
    yExpression;
    widthExpression;
    heightExpression;

    /**
     * @param {Expression} xExpression 
     * @param {Expression} yExpression 
     * @param {Expression} widthExpression 
     * @param {Expression} heightExpression 
     */
    constructor(xExpression, yExpression, widthExpression, heightExpression) {
        super();

        this.xExpression = xExpression;
        this.yExpression = yExpression;
        this.widthExpression = widthExpression;
        this.heightExpression = heightExpression;
    }

    async interpret(environment) {
        if (!this.xExpression) {
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            return null;
        }

        const x = this.xExpression.interpret(environment);
        const y = this.yExpression.interpret(environment);
        const w = this.widthExpression.interpret(environment);
        const h = this.heightExpression.interpret(environment);

        ctx.fillRect(x, y, w, h);
        return null;
    }
}

class TextStatement extends Statement {

    xExpression;
    yExpression;
    textExpression;

    /**
     * @param {Expression} xExpression 
     * @param {Expression} yExpression 
     * @param {Expression} textExpression 
     */
    constructor(xExpression, yExpression, textExpression) {
        super();

        this.xExpression = xExpression;
        this.yExpression = yExpression;
        this.textExpression = textExpression;
    }

    async interpret(environment) {
        const x = this.xExpression.interpret(environment);
        const y = this.yExpression.interpret(environment);
        const text = this.textExpression.interpret(environment);

        ctx.font = '20px dejavu, monospace';
        ctx.fillText(text, x, y);
        return null;
    }
}

class SleepStatement extends Statement {

    sleepExpression

    /**
     * @param {Expression} sleepExpression 
     */
    constructor(sleepExpression) {
        super();

        this.sleepExpression = sleepExpression;
    }

    async interpret(environment) {
        const sleepDuration = this.sleepExpression.interpret(environment);
        await sleep(sleepDuration);
        return null;
    }
}

class SizeStatement extends Statement {

    sizeXExpression;
    sizeYExpression;

    /**
     * @param {Expression} sizeXExpression 
     * @param {Expression} sizeYExpression 
     */
    constructor(sizeXExpression, sizeYExpression) {
        super();

        this.sizeXExpression = sizeXExpression;
        this.sizeYExpression = sizeYExpression;
    }

    async interpret(environment) {
        const currentSprite = environment.currentSprite;

        if (!currentSprite) {
            throw new Error('SIZE can only be used in SPRITE block');
        }

        const sizeXValue = this.sizeXExpression.interpret(environment);
        const sizeYValue = this.sizeYExpression.interpret(environment);

        currentSprite.sizeX = sizeXValue;
        currentSprite.sizeY = sizeYValue;

        return null;
    }
}

class DrawStatement extends Statement {

    xExpression;
    yExpression;
    nameExpression;
    frameIndexExpression;

    /**
     * @param {Expression} xExpression 
     * @param {Expression} yExpression 
     * @param {Expression} nameExpression 
     * @param {Expression} frameIndexExpression 
     */
    constructor(xExpression, yExpression, nameExpression, frameIndexExpression) {
        super();

        this.xExpression = xExpression;
        this.yExpression = yExpression;
        this.nameExpression = nameExpression;
        this.frameIndexExpression = frameIndexExpression;
    }

    async interpret(environment) {
        const x = this.xExpression.interpret(environment);
        const y = this.yExpression.interpret(environment);
        const name = this.nameExpression.interpret(environment);
        const frameSpec = this.frameIndexExpression.interpret(environment);

        const sprite = environment.getSprite(name);

        let frame = null;
        if (typeof frameSpec == 'number') {
            frame = sprite.frames[frameSpec];
        } else if (typeof frameSpec == 'string') {
            frame = sprite.frameMap.get(frameSpec);
        }

        const colorBefore = ctx.fillStyle;
        
        for (let i = 0; i < frame.pixelData.length; i++) {
            for (let j = 0; j < frame.pixelData[i].length; j++) {
                const char = frame.pixelData[i][j];
                const color = frame.colorData.get(char);
                
                if (!color) {
                    continue;
                }

                ctx.fillStyle = color;

                ctx.fillRect(x + j * 4, y + i * 4, 4, 4);
            }
        }

        ctx.fillStyle = colorBefore;

        return null;
    }
}

class ColorDataStatement extends Statement {

    charExpression;
    colorExpression;

    /**
     * 
     * @param {Expression} charExpression 
     * @param {Expression} colorExpression 
     */
    constructor(charExpression, colorExpression) {
        super();

        this.charExpression = charExpression;
        this.colorExpression = colorExpression;
    }

    async interpret(environment) {
        const charValue = this.charExpression.interpret(environment);
        const colorValue = this.colorExpression.interpret(environment);

        if (!environment.currentSprite) {
            throw new Error('COLORDATA can be used in SPRITE block')
        }

        environment.currentSprite.currentFrame.colorData.set(charValue, colorValue);

        return null;
    }
}

class PixelDataStatement extends Statement {

    dataExpression;

    /**
     * 
     * @param {Expression} dataExpression 
     */
    constructor(dataExpression) {
        super();

        this.dataExpression = dataExpression;
    }

    async interpret(environment) {
        const dataValue = this.dataExpression.interpret(environment);
        const currentSprite = environment.currentSprite;

        if (!currentSprite) {
            throw new Error('PIXELDATA can be used in SPRITE block');
        }

        if (dataValue.length > currentSprite.sizeX) {
            throw new Error('PIXELDATA exceeds SPRITE width');
        }

        if (currentSprite.currentFrame.pixelData.length + 1 > currentSprite.sizeY) {
            throw new Error('PIXELDATA exceeds SPRITE height');
        }

        currentSprite.currentFrame.pixelData.push(dataValue);

        return null;
    }
}

class BarStatement extends Statement {

    barExpression;

    /**
     * 
     * @param {Expression} barExpression 
     */
    constructor(barExpression) {
        super();

        this.barExpression = barExpression;
    }

    async interpret(environment) {
        const bar = this.barExpression.interpret(environment);
        const currentSong = environment.currentSong;
        const currentSheet = currentSong.currentSheet;

        if (!(currentSong && currentSheet)) {
            throw new Error('BAR misuse');
        }

        currentSheet.bars += `${bar}\n`;

        return null;
    }
}

class GainStatement extends Statement {

    gainExpression;

    /**
     * @param {Expression} gainExpression 
     */
    constructor(gainExpression) {
        super();
        
        this.gainExpression = gainExpression;
    }

    async interpret(environment) {
        const gainValue = this.gainExpression.interpret(environment);

        const currentSong = environment.currentSong;
        currentSong.currentSheet.gain = gainValue / 100;

        return null;
    }
}

class BpmStatement extends Statement {

    bpmExpression;

    /**
     * @param {Expression} bpmExpression 
     */
    constructor(bpmExpression) {
        super();

        this.bpmExpression = bpmExpression;
    }

    async interpret(environment) {
        const bpmValue = this.bpmExpression.interpret(environment);

        environment.currentSong.bpm = bpmValue;

        return null;
    }
}

class LoopStatement extends Statement {

    loopExpression;

    /**
     * @param {Expression} loopExpression 
     */
    constructor(loopExpression) {
        super();

        this.loopExpression = loopExpression;
    }

    async interpret(environment) {
        const loopValue = this.loopExpression.interpret(environment);

        environment.currentSong.loop = isTruthy(loopValue);

        return null;
    }
}

class TypeStatement extends Statement {

    waveTypeExpression;

    /**
     * @param {Expression} waveTypeExpression 
     */
    constructor(waveTypeExpression) {
        super();

        this.waveTypeExpression = waveTypeExpression;
    }

    async interpret(environment) {
        const waveTypeValue = this.waveTypeExpression.interpret(environment);

        const currentSong = environment.currentSong;
        currentSong.currentSheet.type = waveTypeValue;

        return null;
    }
}

class PlayStatement extends Statement {

    songNameExpression;

    /**
     * @param {Expression} songNameExpression 
     */
    constructor(songNameExpression) {
        super();

        this.songNameExpression = songNameExpression;
    }

    async interpret(environment) {
        const song = environment.getSong(this.songNameExpression.interpret(environment));
        song.play();

        return null;
    }
}

class StopStatement extends Statement {

    songNameExpression;

    /**
     * @param {Expression} songNameExpression 
     */
    constructor(songNameExpression) {
        super();

        this.songNameExpression = songNameExpression;
    }

    async interpret(environment) {
        const song = environment.getSong(this.songNameExpression.interpret(environment));
        song.stop();

        return null;
    }
}

class IfStatement extends Statement {

    conditionExpression;
    ifBranch;
    elseBranch;

    /**
     * @param {Expression} conditionExpression 
     * @param {Statement[]} ifBranch 
     * @param {Statement[]} elseBranch 
     */
    constructor(conditionExpression, ifBranch, elseBranch) {
        super();

        this.conditionExpression = conditionExpression;
        this.ifBranch = ifBranch;
        this.elseBranch = elseBranch;
    }

    async interpret(environment) {

        const condition = this.conditionExpression.interpret(environment);

        if (isTruthy(condition)) {
            for (const statement of this.ifBranch) {
                await statement.interpret(environment);
            }
        } else {
            for (const statement of this.elseBranch) {
                await statement.interpret(environment);
            }
        }

        return null;
    }
}

class WhileBlock extends BlockStatement {

    conditionExpression;

    /**
     * 
     * @param {Statement[]} statements 
     * @param {Expression} conditionExpression 
     */
    constructor(statements, conditionExpression) {
        super(statements);

        this.conditionExpression = conditionExpression;
    }

    async interpret(environment) {
        let condition = this.conditionExpression.interpret(environment);

        while (isTruthy(condition) && running) {
            await this.executeBlock(new Environment(environment));
            condition = this.conditionExpression.interpret(environment);
        }

        return null;
    }
}

class ForBlock extends BlockStatement {
    
    initializer;
    condition;
    increment;

    /**
     * @param {Statement[]} statements 
     * @param {Statement} initializer 
     * @param {Expression} condition 
     * @param {Statement} increment 
     */
    constructor(statements, initializer, condition, increment) {
        super(statements);

        this.initializer = initializer;
        this.condition = condition;
        this.increment = increment;
    }

    async interpret(environment) {

        this.initializer.interpret(environment);

        let condition = this.condition.interpret(environment);
        while (isTruthy(condition) && running) {
            await this.executeBlock(new Environment(environment));

            this.increment.interpret(environment);

            condition = this.condition.interpret(environment);
        }

        return null;
    }
}

class SpriteBlock extends BlockStatement {

    nameExpression;

    /**
     * @param {Statement[]} statements 
     * @param {Expression} nameExpression 
     */
    constructor(statements, nameExpression) {
        super(statements);
        
        this.nameExpression = nameExpression;
    }

    async interpret(environment) {
        const nameValue = this.nameExpression.interpret(environment);

        environment.addNewSprite(nameValue);

        await this.executeBlock(new Environment(environment));

        environment.resetSprite();

        return null;
    }
}

class FrameBlock extends BlockStatement {

    frameNameExpression;

    /**
     * @param {Statement[]} statements 
     * @param {Expression} frameNameExpression 
     */
    constructor(statements, frameNameExpression) {
        super(statements);

        this.frameNameExpression = frameNameExpression;
    }

    async interpret(environment) {
        const currentSprite = environment.currentSprite;

        if (!currentSprite) {
            throw new Error('FRAME block can only be used in SPRITE block');
        }

        currentSprite.frameIndex++;
        currentSprite.currentFrame = new Frame(this.frameNameExpression.interpret(environment));

        await this.executeBlock(new Environment(environment));

        return null;
    }
}

class SongBlock extends BlockStatement {

    nameExpression;

    /**
     * @param {Statement[]} statements 
     * @param {Expression} nameExpression 
     */
    constructor(statements, nameExpression) {
        super(statements);

        this.nameExpression = nameExpression;
    }

    async interpret(environment) {
        const nameValue = this.nameExpression.interpret(environment);

        environment.addNewSong(nameValue);

        await this.executeBlock(new Environment(environment));

        environment.resetSong();

        return null;
    }
}

class SheetBlock extends BlockStatement {

    async interpret(environment) {
        const newSheet = new Sheet(environment.currentSong);
        environment.currentSong.addSheet(newSheet);

        await this.executeBlock(new Environment(environment));

        return null;
    }
}

class Parser {

    #tokens;
    #current;
    #callbacks;

    /**
     * @param {Token[]} tokens 
     */
    constructor(tokens, callbacks) {
        this.#tokens = tokens;
        this.#current = 0;
        this.#callbacks = callbacks;
    }

    parse() {
        const statements = [];

        while (!this.#isAtEnd()) {
            statements.push(this.#declaration());
        }

        return statements;
    }

    #declaration() {
        if (this.#match(TokenType.LET)) {
            return this.#varDeclaration(); 
        }

        return this.#statement();
    }

    #varDeclaration() {
        const name = this.#consume(TokenType.IDENTIFIER, 'Expected variable name.');

        let initializer = null;
        if (this.#match(TokenType.EQUAL)) {
            initializer = this.#expression();
        }

        return new LetStatement(name, initializer);
    }

    #statement() {
        if (this.#match(TokenType.DEBUG)) {
            return this.#debugStatement();
        }

        if (this.#match(TokenType.PRINT)) {
            return this.#printStatement();
        }
        
        if (this.#match(TokenType.WINDOW)) {
            return this.#windowStatement();
        }

        if (this.#match(TokenType.COLOR)) {
            return this.#colorStatement();
        }

        if (this.#match(TokenType.FILL)) {
            if (this.#match(TokenType.ALL)) {
                return new FillStatement();
            }

            return this.#fillStatement();
        }

        if (this.#match(TokenType.TEXT)) {
            return this.#textStatement();
        }

        if (this.#match(TokenType.SLEEP)) {
            return this.#sleepStatement();
        }

        if (this.#match(TokenType.SIZE)) {
            return this.#sizeStatement();
        }

        if (this.#match(TokenType.DRAW)) {
            return this.#drawStatement();
        }

        if (this.#match(TokenType.COLORDATA)) {
            return this.#colorDataStatement();
        }

        if (this.#match(TokenType.PIXELDATA)) {
            return this.#pixelDataStatement();
        }

        if (this.#match(TokenType.BAR)) {
            return this.#barStatement();
        }

        if (this.#match(TokenType.GAIN)) {
            return this.#gainStatement();
        }

        if (this.#match(TokenType.BPM)) {
            return this.#bpmStatement();
        }

        if (this.#match(TokenType.LOOP)) {
            return this.#loopStatement();
        }

        if (this.#match(TokenType.TYPE)) {
            return this.#typeStatement();
        }

        if (this.#match(TokenType.PLAY)) {
            return this.#playStatement();
        }

        if (this.#match(TokenType.STOP)) {
            return this.#stopStatement();
        }

        if (this.#match(TokenType.THEN)) {
            return new BlockStatement(this.#block());
        }

        if (this.#match(TokenType.IF)) {
            return this.#ifStatement();
        }

        if (this.#match(TokenType.WHILE)) {
            return this.#whileBlock();
        }

        if (this.#match(TokenType.FOR)) {
            return this.#forBlock();
        }

        if (this.#match(TokenType.SPRITE)) {
            return this.#spriteBlock();
        }

        if (this.#match(TokenType.FRAME)) {
            return this.#frameBlock();
        }

        if (this.#match(TokenType.SONG)) {
            return this.#songBlock();
        }

        if (this.#match(TokenType.SHEET)) {
            return this.#sheetBlock();
        }

        return this.#expressionStatement();
    }

    #block() {
        const statements = [];

        while (!this.#check(TokenType.END) && !this.#isAtEnd()) {
            statements.push(this.#declaration());
        }

        this.#consume(TokenType.END, `Expected 'END' after block.`);
        return statements;
    }

    #expressionStatement() {
        const expression = this.#expression();
        return new ExpressionStatement(expression)
    }

    #debugStatement() {
        const expression = this.#expression();
        return new DebugStatement(expression);
    }

    #printStatement() {
        const expression = this.#expression();
        return new PrintStatement(expression, this.#callbacks.onPrint);
    }

    #windowStatement() {
        const widthExpression = this.#expression();

        this.#consume(TokenType.COMMA, `[Line ${this.#peek().line}]: Missing comma`);

        const heightExpression = this.#expression();

        return new WindowStatement(widthExpression, heightExpression);
    }

    #colorStatement() {
        const expression = this.#expression();
        
        return new ColorStatement(expression);
    }

    #fillStatement() {
        const xExpression = this.#expression();
        this.#consume(TokenType.COMMA, `[Line ${this.#peek().line}]: Missing comma`);
        
        const yExpression = this.#expression();
        this.#consume(TokenType.COMMA, `[Line ${this.#peek().line}]: Missing comma`);
        
        const widthExpression = this.#expression();
        this.#consume(TokenType.COMMA, `[Line ${this.#peek().line}]: Missing comma`);
        
        const heightExpression = this.#expression();

        return new FillStatement(xExpression, yExpression, widthExpression, heightExpression);
    }

    #textStatement() {
        const xExpression = this.#expression();
        this.#consume(TokenType.COMMA, `[Line ${this.#peek().line}]: Missing comma`);
        
        const yExpression = this.#expression();
        this.#consume(TokenType.COMMA, `[Line ${this.#peek().line}]: Missing comma`);
        
        const textExpression = this.#expression();

        return new TextStatement(xExpression, yExpression, textExpression);
    }

    #sleepStatement() {
        const sleepExpression = this.#expression();

        return new SleepStatement(sleepExpression);
    }

    #sizeStatement() {
        const sizeX = this.#expression();
        this.#consume(TokenType.COMMA, `[Line ${this.#peek().line}]: Missing comma`);

        const sizeY = this.#expression();

        return new SizeStatement(sizeX, sizeY);
    }

    #drawStatement() {
        const xExpression = this.#expression();
        this.#consume(TokenType.COMMA, `[Line ${this.#peek().line}]: Missing comma`);
        
        const yExpression = this.#expression();
        this.#consume(TokenType.COMMA, `[Line ${this.#peek().line}]: Missing comma`);
        
        const nameExpression = this.#expression();
        this.#consume(TokenType.COMMA, `[Line ${this.#peek().line}]: Missing comma`);

        const frameExpression = this.#expression();

        return new DrawStatement(xExpression, yExpression, nameExpression, frameExpression);
    }

    #colorDataStatement() {
        const char = this.#expression();
        this.#consume(TokenType.COMMA, `[Line ${this.#peek().line}]: Missing comma`);

        const color = this.#expression();

        return new ColorDataStatement(char, color);
    }

    #pixelDataStatement() {
        const data = this.#expression();

        return new PixelDataStatement(data);
    }

    #barStatement() {
        let bar = null;
        if (this.#peek().type == TokenType.STRING || this.#peek().type == TokenType.IDENTIFIER) {
            bar = this.#expression();
        } else {
            throw new Error('BAR must have a bar: BAR "C4 -- D4"');
        }

        return new BarStatement(bar);
    }

    #gainStatement() {
        let gain = null;
        if (this.#peek().type == TokenType.NUMBER || this.#peek().type == TokenType.IDENTIFIER) {
            gain = this.#expression();
        } else {
            throw new Error('GAIN must have a number: GAIN 80');
        }

        return new GainStatement(gain);
    }

    #bpmStatement() {
        let bpm = null;
        if (this.#peek().type == TokenType.NUMBER || this.#peek().type == TokenType.IDENTIFIER) {
            bpm = this.#expression();
        } else {
            throw new Error('BPM must have a number: BPM 120');
        }

        return new BpmStatement(bpm);
    }

    #loopStatement() {
        let loop = this.#expression();
        return new LoopStatement(loop);
    }

    #typeStatement() {
        let waveType = null;
        if (this.#peek().type == TokenType.STRING || this.#peek().type == TokenType.IDENTIFIER) {
            waveType = this.#expression();
        } else {
            throw new Error('TYPE must have a type: TYPE "sawtooth"');
        }

        return new TypeStatement(waveType);
    }

    #playStatement() {
        let songName = null;
        if (this.#peek().type == TokenType.STRING || this.#peek().type == TokenType.IDENTIFIER) {
            songName = this.#expression();
        } else {
            throw new Error('PLAY must have a songName: PLAY "song"');
        }

        return new PlayStatement(songName);
    }

    #stopStatement() {
        let songName = null;
        if (this.#peek().type == TokenType.STRING || this.#peek().type == TokenType.IDENTIFIER) {
            songName = this.#expression();
        } else {
            throw new Error('STOP must have a songName: STOP "song"');
        }

        return new StopStatement(songName);
    }

    #ifStatement() {
        this.#match(TokenType.LEFT_P);
        const condition = this.#expression();
        this.#match(TokenType.RIGHT_P);

        this.#consume(TokenType.THEN, `Expected 'THEN' to start 'IF' statement`);
        
        const ifBranch = [];
        while (!this.#check(TokenType.END) && !this.#check(TokenType.ELSE) && !this.#isAtEnd()) {
            ifBranch.push(this.#declaration());
        }

        const elseBranch = [];
        if (this.#match(TokenType.ELSE)) {
            while (!this.#check(TokenType.END) && !this.#isAtEnd()) {
                elseBranch.push(this.#declaration());
            }
        }
        
        this.#consume(TokenType.END, `Expected 'END' to end 'IF' statement`);

        return new IfStatement(condition, ifBranch, elseBranch);
    }

    #whileBlock() {

        this.#match(TokenType.LEFT_P);
        const condition = this.#expression();
        this.#match(TokenType.RIGHT_P);

        this.#consume(TokenType.THEN, `Expected 'THEN' to start 'WHILE' block`);

        return new WhileBlock(this.#block(), condition);
    }

    #forBlock() {
        this.#match(TokenType.LEFT_P);
        const initializer = this.#declaration();
        
        this.#consume(TokenType.COLON, `Missing colon: [:]`);
        
        const condition = this.#expression();
        
        this.#consume(TokenType.COLON, `Missing colon: [:]`);
        
        const increment = this.#declaration();
        this.#match(TokenType.RIGHT_P);

        this.#consume(TokenType.THEN, `Expected 'THEN' to start 'FOR' block`);

        return new ForBlock(this.#block(), initializer, condition, increment);
    }

    #spriteBlock() {
        let name = null;
        if (this.#peek().type == TokenType.STRING || this.#peek().type == TokenType.IDENTIFIER) {
            name = this.#expression();
        } else {
            throw new Error('SPRITE must have a name: SPRITE "exampleSprite"');
        }

        return new SpriteBlock(this.#block(), name);
    }

    #frameBlock() {
        let name = null;
        if (this.#peek().type == TokenType.STRING || this.#peek().type == TokenType.IDENTIFIER) {
            name = this.#expression();
        }

        return new FrameBlock(this.#block(), name);
    }

    #songBlock() {
        let name = null;
        if (this.#peek().type == TokenType.STRING || this.#peek().type == TokenType.IDENTIFIER) {
            name = this.#expression();
        } else {
            throw new Error('SONG must have a name: SONG "exampleSong"');
        }

        return new SongBlock(this.#block(), name);
    }

    #sheetBlock() {
        return new SheetBlock(this.#block());
    }

    #expression() {
        return this.#assignment();
    }

    #assignment() {
        let expression = this.#or();

        if (this.#match(TokenType.EQUAL)) {
            const value = this.#assignment();

            if (expression instanceof VariableExpression) {
                const name = expression.name;
                return new AssignmentExpression(name, value);
            }

            throw new Error('Invalid assignment target');
        }

        return expression;
    }

    #or() {
        let expression = this.#and();

        while (this.#match(TokenType.OR)) {
            const operator = this.#previous();
            const right = this.#and();
            expression = new LogicalExpression(expression, operator, right);
        }

        return expression;
    }

    #and() {
        let expression = this.#equality();

        while (this.#match(TokenType.AND)) {
            const operator = this.#previous();
            const right = this.#equality();
            expression = new LogicalExpression(expression, operator, right);
        }

        return expression;
    }

    #equality() {
        let expression = this.#comparison();

        while (this.#match(TokenType.NOT_EQUAL, TokenType.EQUAL_EQUAL)) {
            const operator = this.#previous();
            const right = this.#comparison();
            expression = new BinaryExpression(expression, operator, right);
        }

        return expression;
    }

    #comparison() {
        let expression = this.#term();

        while (this.#match(TokenType.GREATER, TokenType.GREATER_EQUAL, TokenType.LESS, TokenType.LESS_EQUAL)) {
            const operator = this.#previous();
            const right = this.#term();
            expression = new BinaryExpression(expression, operator, right);
        }

        return expression;
    }

    #term() {
        let expression = this.#factor();

        while (this.#match(TokenType.MINUS, TokenType.PLUS)) {
            const operator = this.#previous();
            const right = this.#factor();
            expression = new BinaryExpression(expression, operator, right);
        }

        return expression;
    }

    #factor() {
        let expression = this.#unary();

        while (this.#match(TokenType.SLASH, TokenType.STAR)) {
            const operator = this.#previous();
            const right = this.#unary();
            expression = new BinaryExpression(expression, operator, right);
        }

        return expression;
    }

    #unary() {
        if (this.#match(TokenType.NOT, TokenType.MINUS)) {
            const operator = this.#previous();
            const right = this.#unary();
            return new UnaryExpression(operator, right);
        }

        return this.#primary();
    }

    #primary() {
        if (this.#match(TokenType.FALSE)) {
            return new LiteralExpression(false);
        }
        
        if (this.#match(TokenType.TRUE)) {
            return new LiteralExpression(true);
        } 
        
        if (this.#match(TokenType.NULL)) {
            return new LiteralExpression(null);
        }

        if (this.#match(TokenType.STRING, TokenType.NUMBER)) {
            return new LiteralExpression(this.#previous().literal);
        }

        if (this.#match(TokenType.IDENTIFIER)) {
            return new VariableExpression(this.#previous());
        }

        if (this.#match(TokenType.LEFT_P)) {
            let expression = this.#expression();
            this.#consume(TokenType.RIGHT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            return new GroupingExpression(expression);
        }

        if (this.#match(TokenType.RANDOM)) {
            this.#consume(TokenType.LEFT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            this.#consume(TokenType.RIGHT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            return new RandomExpression();
        }

        if (this.#match(TokenType.INPUT)) {
            this.#consume(TokenType.LEFT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            const key = this.#expression();
            this.#consume(TokenType.RIGHT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            return new InputExpression(key);
        }

        if (this.#match(TokenType.INT)) {
            this.#consume(TokenType.LEFT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            const number = this.#expression();
            this.#consume(TokenType.RIGHT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            return new IntExpression(number);
        }

        if (this.#match(TokenType.MIN)) {
            this.#consume(TokenType.LEFT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            const value1 = this.#expression();
            this.#consume(TokenType.COMMA, `[Line ${this.#peek().line}]: Missing comma`)
            const value2 = this.#expression();
            this.#consume(TokenType.RIGHT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            return new MinExpression(value1, value2);
        }

        if (this.#match(TokenType.MAX)) {
            this.#consume(TokenType.LEFT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            const value1 = this.#expression();
            this.#consume(TokenType.COMMA, `[Line ${this.#peek().line}]: Missing comma`);
            const value2 = this.#expression();
            this.#consume(TokenType.RIGHT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            return new MaxExpression(value1, value2);
        }

        if (this.#match(TokenType.ABS)) {
            this.#consume(TokenType.LEFT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            const number = this.#expression();
            this.#consume(TokenType.RIGHT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            return new AbsoluteExpression(number);
        }

        if (this.#match(TokenType.FLOOR)) {
            this.#consume(TokenType.LEFT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            const number = this.#expression();
            this.#consume(TokenType.RIGHT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            return new FloorExpression(number);
        }

        if (this.#match(TokenType.CEIL)) {
            this.#consume(TokenType.LEFT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            const number = this.#expression();
            this.#consume(TokenType.RIGHT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            return new CeilExpression(number);
        }

        if (this.#match(TokenType.LERP)) {
            this.#consume(TokenType.LEFT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            const a = this.#expression();
            this.#consume(TokenType.COMMA, `[Line ${this.#peek().line}]: Missing comma`);
            const b = this.#expression();
            this.#consume(TokenType.COMMA, `[Line ${this.#peek().line}]: Missing comma`);
            const t = this.#expression();
            this.#consume(TokenType.RIGHT_P, `[Line ${this.#peek().line}]: Missing enclosing parenthesis`);
            return new LerpExpression(a, b, t);
        }

        if (this.#match(TokenType.MOUSEX)) {
            return new MouseXExpression();
        }

        if (this.#match(TokenType.MOUSEY)) {
            return new MouseYExpression();
        }

        throw new SyntaxError(`[Line ${this.#peek().line}]: Missing expression`);
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
        if (this.#isAtEnd()) {
            return false;
        }

        return this.#peek().type == type;
    }

    #advance() {
        if (!this.#isAtEnd()) {
            this.#current++;
        }

        return this.#previous();
    }

    #isAtEnd() {
        return this.#peek().type == TokenType.EOF;
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

        throw new SyntaxError(errorMessage);
    }
}

class Environment {

    #enclosing;

    // primitives
    #values = new Map();

    // sprites
    #sprites = new Map();
    #currentSpriteName = '';

    get currentSprite() {
        if (this.#sprites.has(this.#currentSpriteName)) {
            return this.#sprites.get(this.#currentSpriteName);
        }

        if (this.#enclosing != null) {
            return this.#enclosing.currentSprite;
        }
    }

    // songs
    #songs = new Map();
    #currentSongName = '';

    get currentSong() {
        if (this.#songs.has(this.#currentSongName)) {
            return this.#songs.get(this.#currentSongName);
        }

        if (this.#enclosing != null) {
            return this.#enclosing.currentSong;
        }
    }

    /**
     * @param {Environment} enclosing 
     */
    constructor(enclosing) {
        if (enclosing) {
            this.#enclosing = enclosing;
        } else {
            this.#enclosing = null;
        }
    }

    define(name, value) {
        this.#values.set(name, value);
    }

    /**
     * @param {Token} name 
     */
    get(name) {
        if (this.#values.has(name.lexeme)) {
            return this.#values.get(name.lexeme);
        }

        if (this.#enclosing != null) {
            return this.#enclosing.get(name);
        }

        throw new Error(`Undefined variable: ${name.lexeme}`);
    }

    /**
     * @param {Token} name 
     * @param {*} value 
     */
    assign(name, value) {
        if (this.#values.has(name.lexeme)) {
            this.#values.set(name.lexeme, value);
            return;
        }

        if (this.#enclosing != null) {
            this.#enclosing.assign(name, value);
            return;
        }

        throw new Error(`Undefined variable: ${name.lexeme}`);
    }

    addNewSprite(name) {
        this.#currentSpriteName = name;
        this.#sprites.set(name, new Sprite());
    }

    getSprite(name) {
        if (this.#sprites.has(name)) {
            return this.#sprites.get(name);
        }

        if (this.#enclosing != null) {
            return this.#enclosing.getSprite(name);
        }

        throw new Error(`Undefined sprite: ${name}`);
    }

    resetSprite() {
        this.#currentSpriteName = '';
    }

    addNewSong(name) {
        this.#currentSongName = name;
        this.#songs.set(name, new Song(audioContext));
    }

    getSong(name) {
        if (this.#songs.has(name)) {
            return this.#songs.get(name);
        }

        if (this.#enclosing != null) {
            return this.#enclosing.getSong(name);
        }

        throw new Error(`Undefined song: ${name}`);
    }

    resetSong() {
        this.#currentSongName = '';
    }
}

class Interpreter {

    #envrionment = new Environment();

    /**
     * @param {Statement[]} statements 
     */
    async interpret(statements) {
        for (const statement of statements) {
            await statement.interpret(this.#envrionment);
        }
    }
}

class OneShot {

    /**
     * @type {Scanner}
     */
    #scanner;

    /**
     * @type {Parser}
     */
    #parser;

    /**
     * @type {Interpreter}
     */
    #interpreter;

    constructor(canvasId) {
        canvas = document.getElementById(canvasId);
    }

    onPrint = (message) => {
        console.log(message);
    }

    async run(source) {
        running = true;

        this.#scanner = new Scanner(source);
        const tokens = this.#scanner.scanTokens();
    
        this.#parser = new Parser(tokens, { onPrint: this.onPrint });
        const statements = this.#parser.parse();

        this.#interpreter = new Interpreter();
        await this.#interpreter.interpret(statements);
    }

    stop() {
        running = false;

        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
}