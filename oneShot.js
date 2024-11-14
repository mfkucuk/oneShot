/*
 * oneShot is a sequential programming language used to
 * make games. This file is the interpreter for this language
 * written in pure vanilla JavaScript. 
 */


/**
 * @param {char} char
 */
String.prototype.charCount = function(char) {
    return this.split(char).length - 1;
}

function parseMessage(line) {
    if (line.charCount('"') != 2) {
        throw new SyntaxError('Invalid number of quotation marks');
    }

    const startQuoteIndex = line.indexOf('"');
    const endQuoteIndex = line.indexOf('"', startQuoteIndex + 1);
            
    const message = line.substring(startQuoteIndex + 1, endQuoteIndex);

    return message;
}

/**
 * @param {float} ms
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class oneShot {

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

    onPrint = (message) => {
        console.log(message);
    }

    commandHandlers = {
        PRINT: (args) => {
            const message = parseMessage(args);
            this.onPrint(message);
        },
        DEBUG: (args) => {
            const message = parseMessage(args);
            console.log(message);
        },
        SLEEP: async (args) => {
            const ms = parseFloat(args);
            await sleep(ms);
        },
        COLOR: (args) => {
            const color = parseMessage(args);
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
            text = parseMessage(text);

            this.ctx.fillText(text, x, y);
        },
        FONT: (args) => {
            if (args.charCount(',') != 1) {
                throw new SyntaxError('Usage: FONT fontSize, fontFamily');
            }

            let [fontSize, fontFamily] = args.split(',');
            fontSize = parseFloat(fontSize.trim());
            fontFamily = parseMessage(fontFamily);

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

    run = async function(src) {
        const lines = src.split('\n');
    
        for (let line of lines) {
            if (line.trim() !== '') {
                await this.processLine(line);
            }
        }
    }
}
