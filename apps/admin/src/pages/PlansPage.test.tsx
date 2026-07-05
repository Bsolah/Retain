import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlansPage } from '../pages/PlansPage';
import { renderWithProviders } from '../test/polaris-wrapper';

vi.mock('../hooks/usePlans', () => ({
  usePlans: () => ({
    data: [
      {
        id: 'plan-1',
        name: 'Monthly Box',
        status: 'active',
        planType: 'standard',
        activeSubscriberCount: 12,
        subscriberCount: 12,
        revenue: 1200,
        frequencies: [{ interval: 1, unit: 'month' }],
      },
    ],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useArchivePlan: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useUnarchivePlan: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useDeletePlan: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

describe('PlansPage', () => {
  it('renders plan list with Polaris page title', () => {
    renderWithProviders(<PlansPage />);
    expect(screen.getByText('Subscription plans')).toBeInTheDocument();
    expect(screen.getByText('Monthly Box')).toBeInTheDocument();
  });

  it('navigates to create plan on primary action', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlansPage />);

    await user.click(screen.getByRole('button', { name: 'Create plan' }));
    expect(navigate).toHaveBeenCalledWith('/plans/new');
  });
});
