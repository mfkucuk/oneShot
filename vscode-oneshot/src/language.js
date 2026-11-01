// Everything the editor knows about the OneShot language: the built-in words with
// their documentation, and a light scan of a document for the names it declares.

/**
 * @typedef {object} Entry
 * @property {string} name
 * @property {'keyword' | 'block' | 'command' | 'function' | 'value' | 'constant'} kind
 * @property {string} signature Shown in hovers and completion details
 * @property {string} doc Markdown
 * @property {string} [snippet] Inserted on completion, in VS Code snippet syntax
 */

/** @type {Entry[]} */
const ENTRIES = [
    // Keywords
    { name: 'LET', kind: 'keyword', signature: 'LET NAME = value\nLET NAME[size]', doc: 'Declares a variable, or an array of `size` elements filled with `NULL`.', snippet: 'LET ${1:NAME} = ${2:0}' },
    { name: 'IF', kind: 'keyword', signature: 'IF (condition) THEN ... ELSE ... END', doc: 'Runs the first block when the condition is truthy, otherwise the `ELSE` block. There is no `ELSE IF`: put another `IF` inside the `ELSE`.', snippet: 'IF (${1:condition}) THEN\n\t$0\nEND' },
    { name: 'ELSE', kind: 'keyword', signature: 'ELSE', doc: 'Starts the block of an `IF` that runs when the condition is falsy.' },
    { name: 'WHILE', kind: 'keyword', signature: 'WHILE (condition) THEN ... END', doc: 'Repeats the block while the condition is truthy.', snippet: 'WHILE (${1:TRUE}) THEN\n\t$0\nEND' },
    { name: 'FOR', kind: 'keyword', signature: 'FOR (initializer : condition : increment) THEN ... END', doc: 'Runs the initializer once, then repeats the block and the increment while the condition is truthy. The loop variable only exists inside the loop.', snippet: 'FOR (LET ${1:I} = ${2:0} : $1 < ${3:10} : $1++) THEN\n\t$0\nEND' },
    { name: 'THEN', kind: 'keyword', signature: 'THEN ... END', doc: 'Starts a block. On its own, `THEN ... END` is a block with its own scope.' },
    { name: 'END', kind: 'keyword', signature: 'END', doc: 'Closes a block.' },
    { name: 'FUNC', kind: 'keyword', signature: 'FUNC NAME(params) THEN ... END', doc: 'Declares a function. Functions are values, can be recursive and remember the variables around them.', snippet: 'FUNC ${1:NAME}(${2}) THEN\n\t$0\nEND' },
    { name: 'RETURN', kind: 'keyword', signature: 'RETURN (value)\nRETURN ()', doc: 'Leaves the function, returning `value`. The parentheses are required.', snippet: 'RETURN (${1})' },
    { name: 'AND', kind: 'keyword', signature: 'a AND b', doc: 'Logical and. The right side is only evaluated when the left side is truthy.' },
    { name: 'OR', kind: 'keyword', signature: 'a OR b', doc: 'Logical or. The right side is only evaluated when the left side is falsy.' },
    { name: 'TRUE', kind: 'constant', signature: 'TRUE', doc: 'The boolean true.' },
    { name: 'FALSE', kind: 'constant', signature: 'FALSE', doc: 'The boolean false. Only `FALSE` and `NULL` are falsy.' },
    { name: 'NULL', kind: 'constant', signature: 'NULL', doc: 'No value. Variables declared without a value, and array elements, start as `NULL`.' },
    { name: 'ALL', kind: 'constant', signature: 'FILL ALL', doc: 'Used with `FILL` to fill the whole window.' },

    // Built-in functions and values
    { name: 'RANDOM', kind: 'function', signature: 'RANDOM() → number', doc: 'A random number from 0 up to (but not including) 1.', snippet: 'RANDOM()' },
    { name: 'INPUT', kind: 'function', signature: 'INPUT(key) → boolean', doc: '`TRUE` while the key is held down, e.g. `"W"`, `"ARROWUP"`, `"ESCAPE"` or `" "` for space. A quick tap counts as held until the next `SLEEP`.', snippet: 'INPUT("${1:W}")' },
    { name: 'INT', kind: 'function', signature: 'INT(value) → number', doc: 'The value as a whole number, dropping the fraction. Also converts text like `"42"`.', snippet: 'INT(${1:value})' },
    { name: 'MIN', kind: 'function', signature: 'MIN(a, b) → number', doc: 'The smaller of two numbers.', snippet: 'MIN(${1:a}, ${2:b})' },
    { name: 'MAX', kind: 'function', signature: 'MAX(a, b) → number', doc: 'The larger of two numbers.', snippet: 'MAX(${1:a}, ${2:b})' },
    { name: 'ABS', kind: 'function', signature: 'ABS(x) → number', doc: 'The absolute value.', snippet: 'ABS(${1:x})' },
    { name: 'FLOOR', kind: 'function', signature: 'FLOOR(x) → number', doc: 'Rounds down to a whole number.', snippet: 'FLOOR(${1:x})' },
    { name: 'CEIL', kind: 'function', signature: 'CEIL(x) → number', doc: 'Rounds up to a whole number.', snippet: 'CEIL(${1:x})' },
    { name: 'SQRT', kind: 'function', signature: 'SQRT(x) → number', doc: 'The square root.', snippet: 'SQRT(${1:x})' },
    { name: 'LERP', kind: 'function', signature: 'LERP(a, b, t) → number', doc: 'The value `t` of the way from `a` to `b`: `LERP(0, 100, 0.25)` is 25. Great for smooth movement.', snippet: 'LERP(${1:a}, ${2:b}, ${3:t})' },
    { name: 'SUM', kind: 'function', signature: 'SUM(array) → number', doc: 'The sum of all elements of an array.', snippet: 'SUM(${1:array})' },
    { name: 'COLLIDE', kind: 'function', signature: 'COLLIDE(x1, y1, w1, h1, x2, y2, w2, h2) → boolean', doc: '`TRUE` if two rectangles overlap.', snippet: 'COLLIDE(${1:x1}, ${2:y1}, ${3:w1}, ${4:h1}, ${5:x2}, ${6:y2}, ${7:w2}, ${8:h2})' },
    { name: 'MOUSEX', kind: 'value', signature: 'MOUSEX → number', doc: 'The horizontal mouse position on the canvas, in canvas pixels. Used without parentheses.' },
    { name: 'MOUSEY', kind: 'value', signature: 'MOUSEY → number', doc: 'The vertical mouse position on the canvas, in canvas pixels. Used without parentheses.' },

    // Commands
    { name: 'PRINT', kind: 'command', signature: 'PRINT value', doc: 'Prints a value to the output.', snippet: 'PRINT ${1:value}' },
    { name: 'DEBUG', kind: 'command', signature: 'DEBUG value', doc: 'Logs a value to the developer console.', snippet: 'DEBUG ${1:value}' },
    { name: 'SLEEP', kind: 'command', signature: 'SLEEP milliseconds', doc: 'Waits. A game loop usually ends with `SLEEP 1000 / 60` to run at 60 frames per second.', snippet: 'SLEEP ${1:1000 / 60}' },
    { name: 'WINDOW', kind: 'command', signature: 'WINDOW width, height', doc: 'Sets the size of the canvas.', snippet: 'WINDOW ${1:320}, ${2:240}' },
    { name: 'COLOR', kind: 'command', signature: 'COLOR color', doc: 'Sets the color of `FILL` and `TEXT`. Any CSS color works: `"RED"`, `"#FF8800"`, `"rgb(0, 128, 255)"`, `"hsl(200, 80%, 60%)"`.', snippet: 'COLOR "${1:WHITE}"' },
    { name: 'FILL', kind: 'command', signature: 'FILL x, y, width, height\nFILL ALL', doc: 'Draws a rectangle in the current color, or fills the whole window.', snippet: 'FILL ${1:x}, ${2:y}, ${3:width}, ${4:height}' },
    { name: 'TEXT', kind: 'command', signature: 'TEXT x, y, text', doc: 'Draws text in the current color, with `y` at the baseline of the text.', snippet: 'TEXT ${1:x}, ${2:y}, ${3:"text"}' },
    { name: 'DRAW', kind: 'command', signature: 'DRAW x, y, sprite, frame', doc: 'Draws a frame of a sprite. The frame is a name or an index.', snippet: 'DRAW ${1:x}, ${2:y}, "${3:SPRITE}", ${4:0}' },

    // Sprites
    { name: 'SPRITE', kind: 'block', signature: 'SPRITE name ... END', doc: 'Defines a sprite: pixel art written as text. Every character is drawn as a 4 x 4 pixel square.', snippet: 'SPRITE "${1:NAME}"\n\tSIZE ${2:4}, ${3:4}\n\tFRAME "${4:IDLE}"\n\t\tCOLORDATA "#", "${5:WHITE}"\n\t\tPIXELDATA " ## "\n\t\tPIXELDATA "####"\n\t\tPIXELDATA "####"\n\t\tPIXELDATA " ## "\n\tEND\nEND' },
    { name: 'SIZE', kind: 'command', signature: 'SIZE width, height', doc: 'The size of a sprite in characters. `PIXELDATA` rows are checked against it.', snippet: 'SIZE ${1:8}, ${2:8}' },
    { name: 'FRAME', kind: 'block', signature: 'FRAME name ... END', doc: 'One image of a sprite. The name is optional, since frames can also be drawn by index.', snippet: 'FRAME "${1:NAME}"\n\tCOLORDATA "#", "${2:WHITE}"\n\tPIXELDATA "$0"\nEND' },
    { name: 'COLORDATA', kind: 'command', signature: 'COLORDATA character, color', doc: 'Maps a character of `PIXELDATA` to a color. Characters without a color are transparent.', snippet: 'COLORDATA "${1:#}", "${2:WHITE}"' },
    { name: 'PIXELDATA', kind: 'command', signature: 'PIXELDATA row', doc: 'Adds one row of pixels to the frame.', snippet: 'PIXELDATA "${1}"' },

    // Music
    { name: 'SONG', kind: 'block', signature: 'SONG name ... END', doc: 'Defines a song made of `SHEET`s that play at the same time.', snippet: 'SONG "${1:NAME}"\n\tBPM ${2:120}\n\tSHEET\n\t\tTYPE "${3:square}"\n\t\tGAIN ${4:30}\n\t\tBAR "${5:C4 E4 G4 ..}"\n\tEND\nEND' },
    { name: 'SHEET', kind: 'block', signature: 'SHEET ... END', doc: 'One voice of a song.', snippet: 'SHEET\n\tTYPE "${1:square}"\n\tBAR "${2:C4 E4 G4 ..}"\nEND' },
    { name: 'BAR', kind: 'command', signature: 'BAR notes', doc: 'Adds notes to a sheet, like `"C4 F#4 Bb3"`. Every note lasts one beat, `--` is a rest and `..` holds the previous note one more beat.', snippet: 'BAR "${1:C4 D4 E4 F4}"' },
    { name: 'BPM', kind: 'command', signature: 'BPM beatsPerMinute', doc: 'The speed of a song (default 120).', snippet: 'BPM ${1:120}' },
    { name: 'LOOP', kind: 'command', signature: 'LOOP boolean', doc: 'Whether the song starts over when it ends.', snippet: 'LOOP ${1:TRUE}' },
    { name: 'TYPE', kind: 'command', signature: 'TYPE wave', doc: 'The sound of a sheet: `"sine"` (default), `"square"`, `"sawtooth"` or `"triangle"`.', snippet: 'TYPE "${1|sine,square,sawtooth,triangle|}"' },
    { name: 'GAIN', kind: 'command', signature: 'GAIN volume', doc: 'The volume of a sheet, from 0 to 100 (default 80).', snippet: 'GAIN ${1:50}' },
    { name: 'PLAY', kind: 'command', signature: 'PLAY song', doc: 'Starts playing a song in the background.', snippet: 'PLAY "${1:SONG}"' },
    { name: 'STOP', kind: 'command', signature: 'STOP song', doc: 'Stops a song.', snippet: 'STOP "${1:SONG}"' },
];

const ENTRIES_BY_NAME = new Map(ENTRIES.map(entry => [entry.name, entry]));

/** Snippets that are not tied to a single keyword */
const SNIPPETS = [
    {
        label: 'game loop',
        doc: 'A window and a loop that runs 60 times per second.',
        body: 'WINDOW ${1:320}, ${2:240}\n\nWHILE (TRUE) THEN\n\tCOLOR "${3:BLACK}"\n\tFILL ALL\n\n\t$0\n\n\tSLEEP 1000 / 60\nEND',
    },
    {
        label: 'key press',
        doc: 'Reacts once when a key is pressed, instead of on every frame it is held. Declare `LET KEYWASDOWN = FALSE` before the loop.',
        body: 'LET ${1:KEY}DOWN = INPUT("${2: }")\nIF (${1:KEY}DOWN AND !${1:KEY}WASDOWN) THEN\n\t$0\nEND\n${1:KEY}WASDOWN = ${1:KEY}DOWN',
    },
];

/** Names that INPUT understands (upper-cased KeyboardEvent.key values) */
const KEY_NAMES = [
    ['ARROWUP', 'Up arrow'], ['ARROWDOWN', 'Down arrow'], ['ARROWLEFT', 'Left arrow'], ['ARROWRIGHT', 'Right arrow'],
    [' ', 'Space'], ['ENTER', 'Enter'], ['ESCAPE', 'Escape'], ['SHIFT', 'Shift'], ['CONTROL', 'Control'],
    ['TAB', 'Tab'], ['BACKSPACE', 'Backspace'],
    ...'WASDQERFZXC'.split('').map(key => [key, `The ${key} key`]),
    ...'0123456789'.split('').map(key => [key, `The ${key} key`]),
];

const WAVE_TYPES = ['sine', 'square', 'sawtooth', 'triangle'];

/** A few CSS colors, with hex values so the editor can show swatches */
const COLORS = [
    ['BLACK', '#000000'], ['WHITE', '#FFFFFF'], ['GRAY', '#808080'], ['RED', '#FF0000'], ['ORANGE', '#FFA500'],
    ['YELLOW', '#FFFF00'], ['GOLD', '#FFD700'], ['GREEN', '#008000'], ['LIME', '#00FF00'], ['CYAN', '#00FFFF'],
    ['BLUE', '#0000FF'], ['NAVY', '#000080'], ['PURPLE', '#800080'], ['MAGENTA', '#FF00FF'], ['PINK', '#FFC0CB'],
    ['BROWN', '#A52A2A'], ['SKYBLUE', '#87CEEB'], ['TRANSPARENT', '#00000000'],
];

/**
 * Finds the names a document declares. This is a light regular-expression scan,
 * so it also works while the document has syntax errors.
 * @param {string} text
 */
function scanDocument(text) {
    // Two copies with the same positions as the text: `code` has its comments blanked out, and
    // `bare` also has the inside of its strings blanked out, so keywords are only found in code.
    // Strings are matched first, so a # inside a string is not mistaken for a comment.
    const code = text.replace(/"[^"]*"|#[^\n]*/g, match => match[0] === '"' ? match : ' '.repeat(match.length));
    const bare = code.replace(/"[^"]*"/g, match => `"${' '.repeat(match.length - 2)}"`);
    const lineOf = index => bare.slice(0, index).split('\n').length - 1;

    const functions = [];
    for (const match of bare.matchAll(/\bFUNC\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g)) {
        const params = match[2].split(',').map(param => param.trim()).filter(Boolean);
        functions.push({ name: match[1], params, line: lineOf(match.index) });
    }

    const variables = new Map();
    for (const match of bare.matchAll(/\bLET\s+([A-Za-z_]\w*)\s*(\[)?/g)) {
        if (!variables.has(match[1])) {
            variables.set(match[1], { name: match[1], isArray: Boolean(match[2]), line: lineOf(match.index) });
        }
    }
    for (const fn of functions) {
        for (const param of fn.params) {
            if (!variables.has(param)) {
                variables.set(param, { name: param, isArray: false, line: fn.line, parameterOf: fn.name });
            }
        }
    }

    // Frames belong to the SPRITE before them
    const sprites = [];
    const songs = [];
    for (const match of bare.matchAll(/\b(SPRITE|SONG|FRAME)\b\s*(")?/g)) {
        const [, keyword, quote] = match;

        // Read the name from the copy that still has the inside of the strings
        const nameStart = match.index + match[0].length;
        const name = quote ? code.slice(nameStart, code.indexOf('"', nameStart)) : undefined;
        if (keyword === 'SPRITE' && name !== undefined) {
            sprites.push({ name, frames: [], line: lineOf(match.index) });
        } else if (keyword === 'SONG' && name !== undefined) {
            songs.push({ name, line: lineOf(match.index) });
        } else if (keyword === 'FRAME' && sprites.length > 0) {
            sprites.at(-1).frames.push(name ?? null);
        }
    }

    return { functions, variables: [...variables.values()], sprites, songs };
}

module.exports = { ENTRIES, ENTRIES_BY_NAME, SNIPPETS, KEY_NAMES, WAVE_TYPES, COLORS, scanDocument };
