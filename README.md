# 🏹OneShot
**oneShot.js** is the interpreter for the sequential programming language **OneShot** for ease of making games in the web.

## ✨Features
- No dependencies | Everything is written in vanilla JavaScript. No library or npm dependency.
- Simplicity | Requires very basic programming skills and has an intuitive syntax. 

## Motivations behind OneShot
- Heavily inspired by [Tausly](https://github.com/themelektaus/tausly).
- Creating 100% self-contained games that can be made without any asset files.
- A language that simplifies making small games for game jams where time is critical. 
- Coding a whole interpreter in only one file: [oneShot.js](https://github.com/mfkucuk/oneShot/blob/main/oneShot.js).

## 🚀Quick Start
Put the [oneShot.js](https://github.com/mfkucuk/oneShot/blob/main/oneShot.js) file in the `head` of your HTML file:
```html
<script src="oneShot.js"></script>
```

Then, run OneShot code by running the following script:
```html
<script>
    const oneShot = new OneShot();
    oneShot.run(`PRINT "Hello, OneShot!"`);
</script>
```

Errors are reported to `oneShot.onError` (by default they are logged to the console), and `PRINT` output goes to `oneShot.onPrint`. `oneShot.stop()` stops the running program and its music.

## 🎮Examples
The [examples](examples) folder has programs covering the whole language, from `helloWorld` and `fizzBuzz` to sprites, music and complete games like `snake`, `breakout`, `flappy` and `dodger`.

To try them, serve this folder over http and open `index.html`, then pick an example from the list:
```bash
python3 -m http.server
```

## 🖍️Editor Support
[vscode-oneshot](vscode-oneshot) is a Visual Studio Code extension for `.oneshot` files. It adds highlighting, completion, a panel that runs your game next to the code, and a live preview of your sprites and songs. See its README to install it.

## 📖Language Reference
Keywords are upper case. Statements are separated by whitespace, so each one usually goes on its own line. `#` starts a comment.

### Values and variables
```
LET NAME = "ADA"       # strings use double quotes, and have no escape sequences
LET SCORE = 10         # numbers
LET READY = TRUE       # TRUE / FALSE
LET NOTHING            # starts as NULL
SCORE = SCORE + 1
SCORE++                # ++ and -- work before or after a variable or array element
```
Only `FALSE` and `NULL` are falsy; `0` and `""` are truthy.

Operators, from the lowest precedence to the highest: `OR`, `AND`, `==` `<>`, `<` `<=` `>` `>=`, `+` `-`, `*` `/` `%`, then `!` and unary `-`. `+` joins strings, and turns the other side into text if one side is a string.

### Arrays
```
LET ITEMS[10]          # 10 elements, all NULL
ITEMS[0] = 42
PRINT ITEMS[0] + SUM(ITEMS)
```
Arrays are references: assigning one to another variable, or passing it to a function, does not copy it.

### Control flow
```
IF (X > 10) THEN
    PRINT "BIG"
ELSE
    PRINT "SMALL"
END

WHILE (RUNNING) THEN
    SLEEP 1000 / 60
END

FOR (LET I = 0 : I < 10 : I++) THEN
    PRINT I
END
```
There is no `ELSE IF`; put another `IF` inside the `ELSE`. Variables declared inside `WHILE`, `FOR`, `THEN ... END` blocks and functions are local to them.

### Functions
```
FUNC ADD(A, B) THEN
    RETURN (A + B)
END
PRINT ADD(1, 2)
```
`RETURN` needs parentheses: `RETURN (VALUE)`, or `RETURN ()` to return nothing. Functions are values, can be recursive, and remember the variables around them (closures).

### Built-in functions
| Function | Result |
| --- | --- |
| `RANDOM()` | A random number from 0 up to 1 |
| `INPUT(key)` | `TRUE` while a key is held, e.g. `"W"`, `"ARROWUP"`, `"ESCAPE"`, `" "` for space |
| `MOUSEX`, `MOUSEY` | Mouse position on the canvas (no parentheses) |
| `INT(x)` | `x` as a whole number, also converts text like `"42"` |
| `MIN(a, b)`, `MAX(a, b)`, `ABS(x)` | The usual |
| `FLOOR(x)`, `CEIL(x)`, `SQRT(x)` | The usual |
| `LERP(a, b, t)` | The value `t` of the way from `a` to `b` |
| `SUM(array)` | The sum of all elements |
| `COLLIDE(x1, y1, w1, h1, x2, y2, w2, h2)` | `TRUE` if two rectangles overlap |

### Commands
| Command | Effect |
| --- | --- |
| `PRINT value` | Prints to `onPrint` |
| `DEBUG value` | Logs to the browser console |
| `SLEEP ms` | Waits, e.g. `SLEEP 1000 / 60` once per frame in a game loop |
| `WINDOW width, height` | Sets the canvas size (and creates a canvas if there is none) |
| `COLOR "red"` | Sets the color for `FILL` and `TEXT`. Any CSS color works |
| `FILL x, y, width, height` | Draws a rectangle |
| `FILL ALL` | Fills the whole canvas |
| `TEXT x, y, text` | Draws text, with `y` at the text's baseline |
| `DRAW x, y, sprite, frame` | Draws a sprite frame, given by name or by index |

### Sprites
Sprites are pixel art written as text. `COLORDATA` maps a character to a color, `PIXELDATA` adds one row, and each character is drawn as a 4 x 4 pixel square. Characters without a color are transparent.
```
SPRITE "COIN"
    SIZE 4, 4
    FRAME "SHINY"      # the frame name is optional
        COLORDATA "#", "GOLD"
        PIXELDATA " ## "
        PIXELDATA "####"
        PIXELDATA "####"
        PIXELDATA " ## "
    END
END

DRAW 10, 10, "COIN", "SHINY"
DRAW 40, 10, "COIN", 0
```

### Music
A `SONG` is made of `SHEET`s that play at the same time. Each `BAR` lists notes like `C4`, `F#4` or `Bb3`; every note lasts one beat, `--` is a rest and `..` holds the previous note one more beat.
```
SONG "JINGLE"
    BPM 240            # beats per minute (default 120)
    LOOP FALSE
    SHEET
        TYPE "square"  # sine (default), square, sawtooth or triangle
        GAIN 30        # volume, 0 - 100 (default 80)
        BAR "C5 E5 G5 .. -- C6 .. .."
    END
END

PLAY "JINGLE"          # plays in the background
STOP "JINGLE"
```
