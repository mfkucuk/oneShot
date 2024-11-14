/*
 * oneShot is a sequential programming language used to
 * make games. This file is the interpreter for this language
 * written in pure vanilla JavaScript. 
 */

const root = document.getElementsByTagName('body')[0];

const canvas2d = document.createElement('canvas');
const ctx = canvas2d.getContext('2d');

root.appendChild(canvas2d);



const code = 
`
    PRINT "Wait one second..."
    SLEEP 1000
    PRINT "Hello, world!"
    SLEEP 2000
    COLOR "red"
    FILL
`;

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

function onPrint(message) {
    console.log(message);
}

/**
 * @param {float} ms
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * @param {string} src
 */
async function runCode(src) {
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
            onPrint(message);
        } else if (token == 'DEBUG') {
            const message = parseMessage(line);
            console.log(message);
        } else if (token == 'SLEEP') {
            const ms = parseFloat(line.substring(firstWhitespaceIndex).trim());
            await sleep(ms);
        } else if (token == 'COLOR') {
            const color = parseMessage(line);
            ctx.fillStyle = color;
        } else if (token == 'FILL') {
            if (line.trim().length == 4) {
                ctx.fillRect(0, 0, canvas2d.width, canvas2d.height);
            }
        }
    }
}

runCode(code);


