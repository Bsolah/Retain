const tsJestResolver = require('ts-jest-resolver').default;

/** Resolve ESM `.js` imports to `.ts` sources within the Retain API package. */
module.exports = (path, options) => {
  const basedir = options.basedir ?? '';

  if (
    /^\.\.\//.test(path) &&
    path.endsWith('.js') &&
    basedir.includes('/apps/api/src')
  ) {
    try {
      return tsJestResolver(path.replace(/\.js$/, '.ts'), options);
    } catch {
      try {
        return tsJestResolver(path.replace(/\.js$/, ''), options);
      } catch {
        // fall through
      }
    }
  }

  return tsJestResolver(path, options);
};
