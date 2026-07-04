import { cleanEnv, port, str, url } from 'envalid';

function encryptionKey(input: string): string {
  if (!/^[0-9a-fA-F]{64}$/.test(input)) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
    );
  }
  return input.toLowerCase();
}

export const env = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ['development', 'test', 'production'],
    default: 'development',
  }),
  PORT: port({ default: 3001 }),
  HOST: str({ default: '0.0.0.0' }),
  DATABASE_URL: str(),
  REDIS_URL: str(),
  JWT_SECRET: str(),
  ENCRYPTION_KEY: str({
    desc: '64-char hex AES-256-GCM key',
  }),
  SHOPIFY_API_KEY: str(),
  SHOPIFY_API_SECRET: str(),
  SHOPIFY_APP_URL: url(),
  ADMIN_APP_URL: str({ default: '' }),
  SCOPES: str({
    default:
      'read_products,write_products,read_customers,write_customers,read_orders,read_own_subscription_contracts,write_own_subscription_contracts',
  }),
  AI_SERVICE_URL: url(),
});

// Validate encryption key format eagerly.
encryptionKey(env.ENCRYPTION_KEY);

export type Env = typeof env;
