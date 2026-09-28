import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("BullScript UI crashed:", error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div role="alert" className="flex min-h-dvh items-center justify-center bg-canvas px-6">
        <div className="panel w-full max-w-lg p-5 font-mono text-xs">
          <p className="text-accent">&gt;_ bullscript</p>
          <p className="mt-3 text-down">✗ the workspace crashed while rendering</p>
          <p className="mt-1 break-words text-ink-2">{this.state.error.message}</p>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={this.reset} className="press rounded-md border border-line px-3 py-1.5 text-ink hover:bg-surface-raised">
              try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="press rounded-md border border-line px-3 py-1.5 text-ink-2 hover:bg-surface-raised"
            >
              reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
