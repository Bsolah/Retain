import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as api from '../lib/api';
import { useAuthStore } from '../stores/auth';

vi.mock('../lib/api', () => ({
  startLogin: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  logout: vi.fn(),
}));

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      authenticated: false,
      shopDomain: null,
      expiresAt: null,
      loading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  it('hydrates authenticated session', async () => {
    vi.mocked(api.getSession).mockResolvedValue({
      authenticated: true,
      shopDomain: 'store.myshopify.com',
      expiresAt: Date.now() + 3600_000,
    });

    await useAuthStore.getState().hydrate();

    const state = useAuthStore.getState();
    expect(state.authenticated).toBe(true);
    expect(state.shopDomain).toBe('store.myshopify.com');
    expect(state.loading).toBe(false);
  });

  it('clears state when session fetch fails', async () => {
    vi.mocked(api.getSession).mockRejectedValue(new Error('network'));

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().authenticated).toBe(false);
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('delegates login to API with shop', () => {
    useAuthStore.getState().login('demo.myshopify.com');
    expect(api.startLogin).toHaveBeenCalledWith('demo.myshopify.com');
  });
});
