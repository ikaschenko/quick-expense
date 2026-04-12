import React, { PropsWithChildren } from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps extends PropsWithChildren {
  // Optional: fallback UI component or render function
  onError?: (error: Error) => void;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("ErrorBoundary caught error:", error, errorInfo);
    if (this.props.onError) {
      this.props.onError(error);
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): JSX.Element | React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "2rem",
            backgroundColor: "var(--color-background)",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-family-base)",
          }}
        >
          <div style={{ maxWidth: "500px", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
              Oops! Something went wrong
            </h1>
            <p style={{ fontSize: "0.95rem", marginBottom: "2rem", lineHeight: "1.5" }}>
              An unexpected error occurred. Please try reloading the page.
            </p>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <details style={{ marginBottom: "2rem", textAlign: "left" }}>
                <summary style={{ cursor: "pointer", fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                  Error details (dev only)
                </summary>
                <pre
                  style={{
                    marginTop: "0.5rem",
                    padding: "1rem",
                    backgroundColor: "var(--color-background-secondary)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.75rem",
                    overflow: "auto",
                  }}
                >
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "var(--color-primary)",
                color: "white",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
