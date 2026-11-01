// Copies the interpreter into the extension before it is packaged, because a packaged
// extension can't reach ../oneShot.js. In the repository the extension uses ../oneShot.js directly.
const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', '..', 'oneShot.js');
const target = path.join(__dirname, '..', 'media', 'oneShot.js');

fs.copyFileSync(source, target);
console.log(`Copied ${source} to ${target}`);
