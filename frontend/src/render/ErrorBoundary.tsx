import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  message: string | null;
}

/** A layout or render failure is shown as text, never a blank crash. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the message visible; the console is not the report.
    console.error('Canvas render failed', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.message !== null) {
      return (
        <div className="error-card" role="alert" data-testid="render-error">
          <h2>Render failed</h2>
          <p>{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
