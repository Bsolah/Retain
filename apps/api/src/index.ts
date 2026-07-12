import { env } from './env.js';
import { startServer } from './server.js';

try {
  await startServer();
  console.info(
    JSON.stringify({
      level: 'info',
      msg: 'Retain API listening',
      shopifyAppUrl: env.SHOPIFY_APP_URL,
      oauthCallback: `${env.SHOPIFY_APP_URL.replace(/\/$/, '')}/auth/callback`,
      adminAppUrl: env.ADMIN_APP_URL || null,
    }),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Failed to start Retain API:', message);
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'Failed to start Retain API',
      err:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
      env: env.NODE_ENV,
    }),
  );
  process.exit(1);
}
