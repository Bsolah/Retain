import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Cloudflare quick tunnels use random *.trycloudflare.com hosts.
    allowedHosts: [
      '.trycloudflare.com',
      '.ngrok-free.app',
      '.ngrok.io',
      'localhost',
      'retainadmin-production.up.railway.app',
    ],
    // Shopify Admin loads the embedded app in an iframe.
    headers: {
      'Content-Security-Policy':
        'frame-ancestors https://admin.shopify.com https://*.myshopify.com https://admin.shopify.com;',
    },
  },
  preview: {
    headers: {
      'Content-Security-Policy':
        'frame-ancestors https://admin.shopify.com https://*.myshopify.com https://admin.shopify.com;',
    },
  },
  build: {
    outDir: 'dist',
  },
});
