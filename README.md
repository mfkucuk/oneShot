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
