// Polyfill para Node 16: Vite/Vitest esperan crypto.getRandomValues (Node >= 17).
// Uso: NODE_OPTIONS="--require ./scripts/node16-crypto-polyfill.js" npx vitest run
const crypto = require('crypto');
if (!crypto.getRandomValues) crypto.getRandomValues = (arr) => crypto.webcrypto.getRandomValues(arr);
if (!globalThis.crypto) globalThis.crypto = crypto.webcrypto;
