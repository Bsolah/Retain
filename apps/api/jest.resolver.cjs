const path = require('node:path');

/**
 * Only remap sibling `./billing-policy.js` under apps/api/src/services so we
 * do not hijack @retain/shopify-admin's own ./billing-policy.js.
 */
module.exports = (request, options) => {
  if (
    request === './billing-policy.js' &&
    typeof options.basedir === 'string' &&
    options.basedir.replace(/\\/g, '/').includes('/apps/api/src/services')
  ) {
    return path.join(options.rootDir, 'src/services/billing-policy.ts');
  }

  return options.defaultResolver(request, options);
};
