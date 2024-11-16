/*
 * oneShot is a sequential programming language used to
 * make games. This file is the interpreter for this language
 * written in pure vanilla JavaScript. 
 */

const TokenType = {
    // Single character token types
    LEFT_P: 0, RIGHT_P: 0,
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
    IF: 0, ELSE: 0, FOR: 0, WHILE: 0, END: 0,
    LET: 0, FUN: 0, NULL: 0,

    // Built-in function token types
    DEBUG: 0, PRINT: 0, WINDOW: 0, COLOR: 0,
    FILL: 0, TEXT: 0, SLEEP: 0,

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
        ['LET', TokenType.LET],
        ['FUN', TokenType.FUN],
        ['NULL', TokenType.NULL],
        ['DEBUG', TokenType.DEBUG],
        ['PRINT', TokenType.PRINT],
        ['WINDOW', TokenType.WINDOW],
        ['COLOR', TokenType.COLOR],
        ['FILL', TokenType.FILL],
        ['TEXT', TokenType.TEXT],
        ['SLEEP', TokenType.SLEEP]
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

            case '<':
                if (this.#match('=')) {
                    this.#addToken(TokenType.LESS_EQUAL);
                } else if (this.#match('>')) {
                    this.#addToken(TokenType.NOT_EQUAL);
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

        const value = parseFloat(this.#start, this.#current);
        this.#addToken(TokenType.NUMBER, value);
    }

    #identifier() {
        while (this.#isAlphaNumberic(this.#peek())) {
            this.#advance();
        }

        const text = this.#source.substring(this.#start, this.#current);
        let type = Scanner.#keywords.get(text);
        if (!type) {
            type = Token.IDENTIFIER;
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


/**
 * @param {char} char
 */
String.prototype.charCount = function(char) {
    return this.split(char).length - 1;
}

/**
 * @param {float} ms
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class Expression {
    interpret() {}
    resolve() {}
    analyse() {}
}

class BinaryExpression extends Expression {
    
    left;
    operator;
    right;

    /**
     * @param {Expression} left 
     * @param {Token} operator 
     * @param {Expression} right 
     */
    constructor(left, operator, right) {
        this.left = left;
        this.operator = operator;
        this.right = right;
    }
}

class OneShot {

    #scanner;

    constructor(canvasId) {
        document.addEventListener('DOMContentLoaded', () => {
            if (canvasId) {
                this.canvas = document.getElementById(canvasId);
            } else {
                this.canvas = document.createElement('canvas');
                document.body.appendChild(this.canvas);
            }
            this.ctx = this.canvas.getContext('2d');
            this.ctx.font = '20px dejavu, monospace';
        
        });

        this.variableManager = {
            variables: new Map(),
            set: function(name, value) {
                const type = typeof value;
                this.variables.set(name, { type, value });
            },
            get: function(name) {
                return this.variables.get(name);
            }
        }
    }

    scanTokens(src) {

    }

    parseExpression(expression) {

        // Check if it's a single literal
        // string check
        if (expression.charCount('"') == 2) {
            const startQuoteIndex = expression.indexOf('"');
            const endQuoteIndex = expression.indexOf('"', startQuoteIndex + 1);
                
            const message = expression.substring(startQuoteIndex + 1, endQuoteIndex);
    
            return message;
        }

        if (expression.charCount('"') == 0) {
            return this.variableManager.get(expression.trim()).value;        
        } 
    }

    onPrint = (message) => {
        console.log(message);
    }

    commandHandlers = {
        PRINT: (args) => {
            const message = this.parseExpression(args);
            this.onPrint(message);
        },
        DEBUG: (args) => {
            const message = this.parseExpression(args);
            console.log(message);
        },
        SLEEP: async (args) => {
            const ms = parseFloat(args);
            await sleep(ms);
        },
        COLOR: (args) => {
            const color = this.parseExpression(args);
            this.ctx.fillStyle = color;
        },
        FILL: (args) => {
            const numbers = args.split(',').map(arg => arg.trim());
            if (numbers.length === 1 && numbers[0] === '') { // No parameters
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            } else if (numbers.length === 4) {
                const [x, y, w, h] = numbers.map(Number);
                this.ctx.fillRect(x, y, w, h);
            } else {
                throw new SyntaxError('FILL can only have 0 or 4 parameters');
            }
        },
        TEXT: (args) => {
            if (args.charCount(',') != 2) {
                throw new SyntaxError('Usage: TEXT x, y, string');
            } 

            let [x, y, text] = args.split(',');
            x = parseFloat(x.trim());
            y = parseFloat(y.trim());
            text = this.parseExpression(text);

            this.ctx.fillText(text, x, y);
        },
        FONT: (args) => {
            if (args.charCount(',') != 1) {
                throw new SyntaxError('Usage: FONT fontSize, fontFamily');
            }

            let [fontSize, fontFamily] = args.split(',');
            fontSize = parseFloat(fontSize.trim());
            fontFamily = this.parseExpression(fontFamily);

            this.ctx.font = `${fontSize}px ${fontFamily}`;
        },
        LET: (args) => {
            let [variableName, expression] = args.split('=');
            if (!variableName) {
                throw new SyntaxError('Usage: LET X | LET X = 5');
            }

            variableName = variableName.trim();
            
            if (!expression) {
                this.variableManager.set(variableName, undefined);
                return;
            }

            expression = expression.trim();

            this.variableManager.set(variableName, Number(expression));
        }
    }

    

    processLine = async function(line) {
        line = line.trim();
        const [command, ...args] = line.split(' ');
        const handler = this.commandHandlers[command];
        if (handler) {
            await handler(args.join(' '));
        } else {
            throw new Error(`Unknown command: ${command}`);
        }
    }

    async run(source) {
        this.#scanner = new Scanner(source);
        this.#scanner.scanTokens();
    }
}