import { env } from './env.js';
import { startServer } from './server.js';

try {
  await startServer();
} catch (error) {
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
