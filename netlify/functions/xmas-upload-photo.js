// Alias to the canonical uploadphoto handler — always returns publicUrl
const { handler } = require("./uploadphoto");
exports.handler = handler;
