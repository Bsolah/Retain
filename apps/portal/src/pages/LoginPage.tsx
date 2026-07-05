import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { resolvePortalShopFromSearch } from '../lib/portal-shop';
import { useAuthStore } from '../stores/auth';

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Sign-in was cancelled.',
  missing_shop: 'Open this page from your store subscription link.',
  shop_not_installed: 'This store has not installed Retain yet.',
  missing_code: 'Sign-in could not be completed. Please try again.',
  invalid_state: 'Sign-in session expired. Please try again.',
};

export function LoginPage() {
  const login = useAuthStore((state) => state.login);
  const [params] = useSearchParams();
  const error = params.get('error');
  const shop = resolvePortalShopFromSearch(params);

  useEffect(() => {
    const fromQuery = params.get('shop')?.trim();
    if (fromQuery) {
      resolvePortalShopFromSearch(params);
    }
  }, [params]);

  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? `Sign-in failed: ${error}`)
    : null;

  return (
    <motion.div
      className="card login-card stack"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h1>Your subscriptions</h1>
      <p className="muted">
        Sign in with your customer account to manage deliveries, pause, skip, or
        update your box.
      </p>
      {shop ? (
        <p className="muted" style={{ fontSize: '0.875rem' }}>
          Store: {shop}
        </p>
      ) : (
        <p className="muted" style={{ fontSize: '0.875rem' }}>
          Use the subscription link from your store email or account page.
        </p>
      )}
      {errorMessage ? (
        <p style={{ color: 'var(--red)' }}>{errorMessage}</p>
      ) : null}
      <button
        type="button"
        className="btn"
        disabled={!shop}
        onClick={() => shop && login(shop)}
      >
        Continue with customer account
      </button>
    </motion.div>
  );
}
