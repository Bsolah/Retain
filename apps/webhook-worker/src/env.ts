import { validateRedisUrl } from '@retain/shared';
import { cleanEnv, makeValidator, port, str } from 'envalid';

function resolveRedisUrl(): void {
  if (process.env.REDIS_URL?.trim()) {
    return;
  }

  process.env.REDIS_URL =
    process.env.REDIS_PRIVATE_URL?.trim() ||
    process.env.REDIS_PUBLIC_URL?.trim() ||
    '';
}
resolveRedisUrl();

export const env = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ['development', 'test', 'production'],
    default: 'development',
  }),
  PORT: port({ default: 3002 }),
  HOST: str({ default: '0.0.0.0' }),
  DATABASE_URL: str(),
  REDIS_URL: makeValidator(validateRedisUrl)(),
  ENCRYPTION_KEY: str({
    desc: '64-char hex AES-256-GCM key (same as API)',
  }),
  SHOPIFY_API_SECRET: str(),
  AI_SERVICE_URL: str({ default: 'http://localhost:8000' }),
  MONITORING_WEBHOOK_URL: str({ default: '' }),
});
