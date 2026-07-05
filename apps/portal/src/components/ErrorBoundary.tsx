import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Portal error boundary', error, info);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="card error-card stack">
          <h2>Something went wrong</h2>
          <p className="muted">{this.state.error.message}</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
