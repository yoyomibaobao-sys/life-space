"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

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
  rcDiagnostics: boolean;
  diagnosticCopied: boolean;
};

export default class MobileShellErrorBoundary extends Component<Props, State> {
  state: State = { error: null, rcDiagnostics: false, diagnosticCopied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidMount() {
    if (!Capacitor.isNativePlatform()) return;
    void App.getInfo().then(({ version }) => {
      if (/-rc\d+$/i.test(version)) this.setState({ rcDiagnostics: true });
    }).catch(() => undefined);
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("mobile-shell-render", this.diagnostic(error));
  }

  private diagnostic(error: Error) {
    return {
      routeKind: this.props.routeKind,
      archiveId: this.props.archiveId || null,
      name: error.name,
      message: error.message,
    };
  }

  private copyDiagnostic = () => {
    if (!this.state.error || !this.state.rcDiagnostics) return;
    void navigator.clipboard?.writeText(
      JSON.stringify(this.diagnostic(this.state.error)),
    ).then(() => this.setState({ diagnosticCopied: true })).catch(() => undefined);
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
                this.setState({ error: null, diagnosticCopied: false });
                this.props.onRetry?.();
              }}
              style={actionStyle}
            >
              {this.props.retryLabel || "Retry"}
            </button>
          ) : null}
          {this.state.rcDiagnostics && typeof navigator.clipboard?.writeText === "function" ? (
            <button type="button" onClick={this.copyDiagnostic} style={actionStyle}>
              {this.state.diagnosticCopied ? "已复制 / Copied" : "复制诊断信息 / Copy diagnostic"}
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
