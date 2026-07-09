import { cleanEnv, port, str } from 'envalid';

export const env = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ['development', 'test', 'production'],
    default: 'development',
  }),
  PORT: port({ default: 3002 }),
  HOST: str({ default: '0.0.0.0' }),
  DATABASE_URL: str(),
  REDIS_URL: str(),
  ENCRYPTION_KEY: str({
    desc: '64-char hex AES-256-GCM key (same as API)',
  }),
  SHOPIFY_API_SECRET: str(),
  AI_SERVICE_URL: str({ default: 'http://localhost:8000' }),
  MONITORING_WEBHOOK_URL: str({ default: '' }),
});
