process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT ?? '3099';
process.env.HOST = '127.0.0.1';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://retain:retain@localhost:5433/retain';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6380';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ??
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY ?? 'test-api-key';
process.env.SHOPIFY_API_SECRET =
  process.env.SHOPIFY_API_SECRET ?? 'test-api-secret';
process.env.SHOPIFY_APP_URL =
  process.env.SHOPIFY_APP_URL ?? 'https://api-test.example.com';
process.env.ADMIN_APP_URL =
  process.env.ADMIN_APP_URL ?? 'https://admin-test.example.com';
process.env.AI_SERVICE_URL =
  process.env.AI_SERVICE_URL ?? 'http://localhost:8000';
process.env.SKIP_BACKGROUND_WORKERS = 'true';
process.env.PROCESS_WEBHOOKS_IN_API = 'false';
