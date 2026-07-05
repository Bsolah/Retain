import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { SkeletonCards } from './components/Skeleton';
import { portalLoginPath, readStoredPortalShop } from './lib/portal-shop';
import { CancelPage } from './pages/CancelPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { ManagePage } from './pages/ManagePage';
import { SubscriptionDetailPage } from './pages/SubscriptionDetailPage';
import { useAuthStore } from './stores/auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const authenticated = useAuthStore((state) => state.authenticated);
  const loading = useAuthStore((state) => state.loading);

  if (loading) {
    return <SkeletonCards count={2} />;
  }

  if (!authenticated) {
    const shop = readStoredPortalShop();
    return (
      <Navigate
        to={shop ? portalLoginPath(shop) : '/login'}
        replace
        state={{ from: location }}
      />
    );
  }

  return children;
}

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthBootstrap>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route path="/portal" element={<DashboardPage />} />
                <Route path="/portal/manage" element={<ManagePage />} />
                <Route
                  path="/portal/:contractId"
                  element={<SubscriptionDetailPage />}
                />
                <Route
                  path="/portal/:contractId/cancel"
                  element={<CancelPage />}
                />
              </Route>
              <Route path="*" element={<Navigate to="/portal" replace />} />
            </Routes>
          </AuthBootstrap>
        </BrowserRouter>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
