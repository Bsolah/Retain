import { Link, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';

export function Layout() {
  const logout = useAuthStore((state) => state.logout);
  const shopDomain = useAuthStore((state) => state.shopDomain);

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div>
          <strong>Retain Portal</strong>
          {shopDomain ? (
            <div className="muted" style={{ color: '#cbd5e1', fontSize: 12 }}>
              {shopDomain}
            </div>
          ) : null}
        </div>
        <nav>
          <Link to="/portal">Dashboard</Link>
          <Link to="/portal/manage">Manage</Link>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void logout()}
          >
            Log out
          </button>
        </nav>
      </header>
      <main className="portal-main">
        <Outlet />
      </main>
    </div>
  );
}
