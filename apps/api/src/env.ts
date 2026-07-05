import { bool, cleanEnv, port, str, url } from 'envalid';

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
      'read_products,write_products,read_customers,write_customers,read_orders,read_own_subscription_contracts,write_own_subscription_contracts,read_themes',
  }),
  AI_SERVICE_URL: url(),
  /** When true, archivePlan also deletes the Selling Plan Group in Shopify. */
  ARCHIVE_DELETE_FROM_SHOPIFY: bool({ default: false }),
  /** Customer portal origin (Vite). */
  PORTAL_URL: str({ default: 'http://localhost:5174' }),
  /** Dev-only fallback when ?shop= is omitted locally. Not used in production. */
  CUSTOMER_ACCOUNT_SHOP_DOMAIN: str({ default: '' }),
  /** Customer Account API / Headless channel client ID. */
  CUSTOMER_ACCOUNT_CLIENT_ID: str({ default: '' }),
  THEME_EXTENSION_BLOCK_HANDLE: str({ default: 'purchase-options' }),
  /** Skip cron workers and BullMQ processors (test/integration). */
  SKIP_BACKGROUND_WORKERS: bool({ default: false }),
  /** Process Shopify webhooks in-process instead of the webhook-worker service. */
  PROCESS_WEBHOOKS_IN_API: bool({ default: false }),
  SENDGRID_API_KEY: str({ default: '' }),
  SENDGRID_FROM_EMAIL: str({ default: 'noreply@retain.app' }),
  SENDGRID_FROM_NAME: str({ default: 'Retain' }),
  TWILIO_ACCOUNT_SID: str({ default: '' }),
  TWILIO_AUTH_TOKEN: str({ default: '' }),
  TWILIO_FROM_NUMBER: str({ default: '' }),
});

// Validate encryption key format eagerly.
encryptionKey(env.ENCRYPTION_KEY);

export type Env = typeof env;
