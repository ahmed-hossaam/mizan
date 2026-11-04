// Vercel's Node.js function entry is CommonJS. The build creates this bundled
// Express handler before Vercel packages the function.
module.exports = require("../artifacts/api-server/dist/vercel-runtime/vercel.cjs").default;
