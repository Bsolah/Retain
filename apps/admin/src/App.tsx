import { NavMenu } from '@shopify/app-bridge-react';
import { AppProvider, Banner, Spinner } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import './app.css';
import { ApiError, fetchShopContext } from './lib/api';
import {
  bootstrapSessionFromUrl,
  getShopId,
  redirectToInstall,
} from './lib/session';
import { AiPerformancePage } from './pages/AiPerformancePage';
import { CohortsPage } from './pages/CohortsPage';
import { CreatePlanPage } from './pages/CreatePlanPage';
import { DashboardPage } from './pages/DashboardPage';
import { EditPlanPage } from './pages/EditPlanPage';
import { MigrationsPage } from './pages/MigrationsPage';
import { PlansPage } from './pages/PlansPage';
import { SubscribersPage } from './pages/SubscribersPage';
import { SupportPage } from './pages/SupportPage';

function AppNavLink({
  to,
  children,
  rel,
}: {
  to: string;
  children: ReactNode;
  rel?: string;
}) {
  const navigate = useNavigate();

  return (
    <a
      href={to}
      rel={rel}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15 * 60 * 1000,
    },
  },
});

function AppRoutes() {
  const [ready, setReady] = useState(Boolean(getShopId()));
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const { shop, host } = bootstrapSessionFromUrl();

    let cancelled = false;
    void (async () => {
      try {
        await fetchShopContext();
        if (!cancelled) {
          setReady(true);
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;

        const params = new URLSearchParams(window.location.search);
        const shopParam = params.get('shop') ?? shop;
        const needsInstall =
          err instanceof ApiError &&
          (err.code === 'UNAUTHENTICATED' ||
            /not installed|not active/i.test(err.message));

        if (shopParam && needsInstall) {
          setInstalling(true);
          redirectToInstall(shopParam, params.get('host') ?? host);
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : 'Missing shop context. Open the app from Shopify Admin.',
        );
        setReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (installing) {
    return <Spinner accessibilityLabel="Redirecting to Shopify install" />;
  }

  if (error) {
    return (
      <Banner tone="critical" title="Session required">
        <p>{error}</p>
      </Banner>
    );
  }

  if (!ready) {
    return <Spinner accessibilityLabel="Loading shop session" />;
  }

  return (
    <>
      <NavMenu>
        <AppNavLink to="/dashboard" rel="home">
          Dashboard
        </AppNavLink>
        <AppNavLink to="/plans">Plans</AppNavLink>
        <AppNavLink to="/subscribers">Subscribers</AppNavLink>
        <AppNavLink to="/cohorts">Retention</AppNavLink>
        <AppNavLink to="/ai">AI Performance</AppNavLink>
        <AppNavLink to="/migrations">Migrations</AppNavLink>
        <AppNavLink to="/support">Support</AppNavLink>
      </NavMenu>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/cohorts" element={<CohortsPage />} />
        <Route path="/subscribers" element={<SubscribersPage />} />
        <Route path="/ai" element={<AiPerformancePage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/migrations" element={<MigrationsPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/plans/new" element={<CreatePlanPage />} />
        <Route path="/plans/:planId/edit" element={<EditPlanPage />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider i18n={enTranslations}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppProvider>
    </QueryClientProvider>
  );
}
