// Shim para Node 16: vite 5 necesita crypto.getRandomValues (Node >= 17).
// Uso: NODE_OPTIONS="--require ./tests/node16-crypto-shim.cjs" npm test
const crypto = require('crypto');
if (typeof crypto.getRandomValues !== 'function' && crypto.webcrypto) {
  crypto.getRandomValues = crypto.webcrypto.getRandomValues.bind(crypto.webcrypto);
}
