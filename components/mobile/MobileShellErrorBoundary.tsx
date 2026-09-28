"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  routeKind: string;
  archiveId?: string | null;
  title: string;
  message: string;
  backLabel: string;
  retryLabel?: string;
  onBack: () => void;
  onRetry?: () => void;
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export default class MobileShellErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("mobile-shell-render", {
      routeKind: this.props.routeKind,
      archiveId: this.props.archiveId || null,
      name: error.name,
      message: error.message,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main data-shell-error-boundary="true" style={{ padding: "28px 18px 80px" }}>
        <h1 style={{ margin: "0 0 10px", fontSize: 20, color: "#243424" }}>{this.props.title}</h1>
        <p style={{ margin: "0 0 18px", color: "#6d7b69", fontSize: 14, lineHeight: 1.6 }}>
          {this.props.message}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={this.props.onBack} style={actionStyle}>
            {this.props.backLabel}
          </button>
          {this.props.onRetry ? (
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
                this.props.onRetry?.();
              }}
              style={actionStyle}
            >
              {this.props.retryLabel || "Retry"}
            </button>
          ) : null}
        </div>
      </main>
    );
  }
}

const actionStyle = {
  minHeight: 42,
  border: "1px solid #c9d6c4",
  borderRadius: 12,
  background: "#fff",
  color: "#355433",
  padding: "0 14px",
  fontWeight: 750,
  cursor: "pointer",
};
