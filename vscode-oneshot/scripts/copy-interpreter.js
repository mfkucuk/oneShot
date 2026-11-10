// Copies the interpreter and its libraries into the extension before it is packaged, because a
// packaged extension can't reach ../oneShot.js. In the repository the extension uses ../oneShot.js directly.
const fs = require('fs');
const path = require('path');

const repository = path.join(__dirname, '..', '..');
const media = path.join(__dirname, '..', 'media');

fs.copyFileSync(path.join(repository, 'oneShot.js'), path.join(media, 'oneShot.js'));
console.log(`Copied oneShot.js to ${media}`);

// IMPORT loads libraries from the lib folder next to oneShot.js
const libraries = path.join(media, 'lib');
fs.rmSync(libraries, { recursive: true, force: true });
fs.cpSync(path.join(repository, 'lib'), libraries, { recursive: true });
console.log(`Copied lib to ${libraries}`);
