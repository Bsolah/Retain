import { create } from 'zustand';
import * as api from '../lib/api';

type AuthState = {
  authenticated: boolean;
  shopDomain: string | null;
  expiresAt: number | null;
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  login: (shop: string) => void;
};

let refreshTimer: number | undefined;

export const useAuthStore = create<AuthState>((set, get) => ({
  authenticated: false,
  shopDomain: null,
  expiresAt: null,
  loading: true,
  error: null,

  login: (shop: string) => {
    api.startLogin(shop);
  },

  hydrate: async () => {
    set({ loading: true, error: null });
    try {
      const session = await api.getSession();
      set({
        authenticated: session.authenticated,
        shopDomain: session.shopDomain ?? null,
        expiresAt: session.expiresAt ?? null,
        loading: false,
      });
      if (session.authenticated && session.expiresAt) {
        scheduleRefresh(session.expiresAt, get);
      }
    } catch {
      set({
        authenticated: false,
        shopDomain: null,
        expiresAt: null,
        loading: false,
      });
    }
  },

  refresh: async () => {
    try {
      const result = await api.refreshSession();
      set({
        authenticated: true,
        expiresAt: result.expiresAt ?? get().expiresAt,
      });
      if (result.expiresAt) {
        scheduleRefresh(result.expiresAt, get);
      }
    } catch {
      set({ authenticated: false, expiresAt: null });
    }
  },

  logout: async () => {
    if (refreshTimer) window.clearTimeout(refreshTimer);
    await api.logout();
    set({
      authenticated: false,
      shopDomain: null,
      expiresAt: null,
    });
  },
}));

function scheduleRefresh(expiresAt: number, get: () => AuthState): void {
  if (refreshTimer) window.clearTimeout(refreshTimer);
  const delay = Math.max(5_000, expiresAt - Date.now() - 5 * 60 * 1000);
  refreshTimer = window.setTimeout(() => {
    void get().refresh();
  }, delay);
}
