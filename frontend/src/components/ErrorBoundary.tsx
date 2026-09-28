import { AlertTriangle } from "lucide-react";
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
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-obsidian px-6 text-center">
          <AlertTriangle className="h-10 w-10 text-bear" />
          <h1 className="text-lg font-semibold text-primary">Something broke in the dashboard</h1>
          <p className="max-w-md text-sm text-slate-text">{this.state.error.message}</p>
          <button
            onClick={this.reset}
            className="rounded-md border border-slate-border bg-slate-card px-4 py-2 text-sm text-bull transition-colors hover:bg-bull/10"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
