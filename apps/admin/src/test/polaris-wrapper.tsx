import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

export function PolarisTestProvider({ children }: { children: ReactNode }) {
  return <AppProvider i18n={enTranslations}>{children}</AppProvider>;
}

export function renderWithProviders(
  ui: ReactElement,
  options?: RenderOptions & { route?: string },
): RenderResult {
  const queryClient = createTestQueryClient();
  const route = options?.route ?? '/';

  return render(
    <QueryClientProvider client={queryClient}>
      <PolarisTestProvider>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </PolarisTestProvider>
    </QueryClientProvider>,
    options,
  );
}
