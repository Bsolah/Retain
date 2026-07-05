import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from '../pages/LoginPage';
import { renderWithRouter } from '../test/test-utils';

const startLogin = vi.fn();
vi.mock('../lib/api', () => ({
  startLogin: (shop: string) => startLogin(shop),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  logout: vi.fn(),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    startLogin.mockClear();
    sessionStorage.clear();
  });

  it('renders sign-in prompt', () => {
    renderWithRouter(<LoginPage />);
    expect(screen.getByText('Your subscriptions')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Continue with customer account/i }),
    ).toBeDisabled();
  });

  it('shows error from query string', () => {
    renderWithRouter(<LoginPage />, { route: '/login?error=access_denied' });
    expect(screen.getByText(/Sign-in was cancelled/)).toBeInTheDocument();
  });

  it('enables login when shop query param is present', () => {
    renderWithRouter(<LoginPage />, {
      route: '/login?shop=demo.myshopify.com',
    });
    expect(screen.getByText(/Store: demo.myshopify.com/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Continue with customer account/i }),
    ).toBeEnabled();
  });

  it('triggers login with shop on button click', async () => {
    const user = userEvent.setup();
    renderWithRouter(<LoginPage />, {
      route: '/login?shop=demo.myshopify.com',
    });

    await user.click(
      screen.getByRole('button', { name: /Continue with customer account/i }),
    );

    expect(startLogin).toHaveBeenCalledWith('demo.myshopify.com');
  });
});
