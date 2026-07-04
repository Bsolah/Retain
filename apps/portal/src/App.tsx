import { APP_NAME } from '@retain/shared';

/**
 * Customer-facing portal scaffold.
 * Customer Account API integration will be added later.
 */
export default function App() {
  return (
    <main className="portal">
      <header className="portal__header">
        <h1>{APP_NAME}</h1>
        <p>Customer portal</p>
      </header>
      <section className="portal__status" aria-live="polite">
        <span className="portal__badge">200 OK</span>
        <p>
          Portal is running. Customer Account API auth and subscription
          management will be wired up next.
        </p>
      </section>
    </main>
  );
}
