"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import MobilePageHeaderView from "@/components/mobile/MobilePageHeaderView";
import { getTranslations, getStoredLanguage } from "@/lib/i18n";

type Props = {
  children: ReactNode;
  onBack: () => void;
};

type State = {
  error: Error | null;
};

export default class ProfileSettingsErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("profile settings view failed", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const copy = getTranslations(getStoredLanguage());
    return (
      <>
        <MobilePageHeaderView
          title={copy.profile.settings_title}
          onBack={this.props.onBack}
          ariaLabel={copy.nav.back}
        />
        <section style={{ padding: "18px 16px 110px", color: "#5d6c59" }}>
          <p>{copy.archive_workspace.offline_notice}</p>
          <button
            type="button"
            onClick={this.props.onBack}
            style={{
              marginTop: 16,
              minHeight: 44,
              padding: "0 16px",
              border: "1px solid #d5dfd0",
              borderRadius: 12,
              background: "#fff",
              fontWeight: 700,
            }}
          >
            {copy.nav.back}
          </button>
        </section>
      </>
    );
  }
}
