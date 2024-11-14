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
        
        });
    }

    onPrint = function(message) {
        console.log(message);
    }

    run = async function(src) {
        const lines = src.split('\n');
    
        for (let line of lines) {
            if (line.trim() == '') {
                continue;
            }
            
            line = line.trim();

            const firstWhitespaceIndex = line.indexOf(' ');

            let token = '';
            if (firstWhitespaceIndex == -1) {
                token = line.substring(0);
            } else {
                token = line.substring(0, firstWhitespaceIndex);        
            }

            if (token == 'PRINT') {
                const message = parseMessage(line);
                this.onPrint(message);
            } else if (token == 'DEBUG') {
                const message = parseMessage(line);
                console.log(message);
            } else if (token == 'SLEEP') {
                const ms = parseFloat(line.substring(firstWhitespaceIndex).trim());
                await sleep(ms);
            } else if (token == 'COLOR') {
                const color = parseMessage(line);
                this.ctx.fillStyle = color;
            } else if (token == 'FILL') {
                if (line.trim().length == 4) {
                    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                } else {
                    if (line.charCount(',') != 3) {
                        throw new SyntaxError('FILL can only have 0 or 4 parameters');
                    }
                    let [x, y, w, h] = line.substring(4).split(',');
                    x = parseInt(x.trim()); 
                    y = parseInt(y.trim()); 
                    w = parseInt(w.trim()); 
                    h = parseInt(h.trim());
                    this.ctx.fillRect(x, y, w, h); 
                }
            }
        }
    }
}