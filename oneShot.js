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

// OneShot classes
class Sprite {
    
    sizeX;
    sizeY;

}

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
    LET: 0, FUN: 0, NULL: 0, ALL: 0,

    // Built-in function token types
    DEBUG: 0, PRINT: 0, WINDOW: 0, COLOR: 0,
    FILL: 0, TEXT: 0, SLEEP: 0, UPDATE: 0,
    SPRITE: 0, SIZE: 0, DRAW: 0,

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
        ['DRAW', TokenType.DRAW]
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
    
    left;
    operator;
    right;

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
    
    expr;

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

    value;

    constructor(value) {
        super();

        this.value = value;
    }

    interpret(environment) {
        return this.value;
    }
}

class LogicalExpression extends Expression {

    left;
    operator;
    right;

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

        return this.right.interpret();
    }
}

class UnaryExpression extends Expression {

    token;
    right;

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
    
    name;

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

class Statement {
    /**
     * @param {Environment} environment 
     */
    async interpret(environment) {}
}

class BlockStatement extends Statement {

    statements;

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
        const sleepDuration = this.sleepExpression.interpret();
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
    }
}

class DrawStatement extends Statement {

    xExpression;
    yExpression;
    nameExpression;

    /**
     * @param {Expression} xExpression 
     * @param {Expression} yExpression 
     * @param {Expression} nameExpression 
     */
    constructor(xExpression, yExpression, nameExpression) {
        super();

        this.xExpression = xExpression;
        this.yExpression = yExpression;
        this.nameExpression = nameExpression;
    }

    async interpret(environment) {
        const x = this.xExpression.interpret(environment);
        const y = this.yExpression.interpret(environment);
        const name = this.nameExpression.interpret(environment);

        const sprite = environment.getSprite(name);
        
        ctx.fillRect(x, y, sprite.sizeX * 4, sprite.sizeY * 4);
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

        while (isTruthy(condition)) {
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
        while (isTruthy(condition)) {
            await this.executeBlock(new Environment(environment));

            this.increment.interpret(environment);

            condition = this.condition.interpret(environment);
        }

    }
}

class UpdateBlock extends BlockStatement {

    /**
     * @type {number}
     */
    fps;

    /**
     * 
     * @param {Statement[]} statements 
     * @param {Expression} fps 
     */
    constructor(statements, fps) {
        super(statements);

        if (fps) {
            this.fps = fps.interpret();
        } else {
            this.fps = 60;
        }
    }

    async interpret(environment) {
        const msPerFrame = 1000 / this.fps;
        let lastFrameTime = performance.now();

        const executeFrame = async (timestamp) => {
            const elapsed = timestamp - lastFrameTime;

            if (elapsed >= msPerFrame) {
                lastFrameTime = timestamp;
                await this.executeBlock(new Environment(environment));
            }

            requestAnimationFrame(executeFrame);
        };

        requestAnimationFrame(executeFrame);

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
        const nameValue = this.nameExpression.interpret();

        environment.addNewSprite(nameValue);

        await this.executeBlock(new Environment(environment));
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

        if (this.#match(TokenType.UPDATE)) {
            return this.#updateBlock();
        }

        if (this.#match(TokenType.SPRITE)) {
            return this.#spriteBlock();
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

        return new DrawStatement(xExpression, yExpression, nameExpression);
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

    #updateBlock() {

        let fps = null;
        if (this.#peek().type == TokenType.NUMBER || this.#peek().type == TokenType.IDENTIFIER) {
            fps = this.#expression();
        }

        this.#consume(TokenType.THEN, `Expected 'THEN' to start 'UPDATE' block`);

        return new UpdateBlock(this.#block(), fps);
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
        this.#scanner = new Scanner(source);
        const tokens = this.#scanner.scanTokens();
    
        this.#parser = new Parser(tokens, { onPrint: this.onPrint });
        const statements = this.#parser.parse();

        this.#interpreter = new Interpreter();
        await this.#interpreter.interpret(statements);
    }
}