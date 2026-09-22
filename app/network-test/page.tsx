"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";
const TIMEOUT_MS = 8000;

type ProbeState = "idle" | "running" | "reachable" | "unreachable";

type ProbeResult = {
  state: ProbeState;
  status?: number;
  durationMs?: number;
  detail?: string;
};

type Probe = {
  website: ProbeResult;
  supabase: ProbeResult;
};

const initialProbe: Probe = {
  website: { state: "idle" },
  supabase: { state: "idle" },
};

async function timedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ProbeResult> {
  const controller = new AbortController();
  const started = performance.now();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(input, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });

    return {
      state: "reachable",
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      detail: response.ok
        ? "已收到正常响应"
        : `已连接到服务，但返回 HTTP ${response.status}`,
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - started);
    const aborted = error instanceof DOMException && error.name === "AbortError";

    return {
      state: "unreachable",
      durationMs,
      detail: aborted
        ? `连接超过 ${TIMEOUT_MS / 1000} 秒，已判定超时`
        : error instanceof Error
          ? error.message
          : "网络请求失败",
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export default function NetworkTestPage() {
  const [probe, setProbe] = useState<Probe>(initialProbe);
  const [lastRun, setLastRun] = useState<string>("");
  const [running, setRunning] = useState(false);

  const supabaseHost = useMemo(() => {
    try {
      return SUPABASE_URL ? new URL(SUPABASE_URL).host : "未配置";
    } catch {
      return "配置无效";
    }
  }, []);

  const runProbe = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setProbe({
      website: { state: "running" },
      supabase: { state: "running" },
    });

    const website = await timedFetch("/login?network_test=1", {
      method: "GET",
      headers: { Accept: "text/html" },
    });

    const supabase = !SUPABASE_URL || !SUPABASE_KEY
      ? {
          state: "unreachable" as const,
          detail: "Supabase 公共配置缺失",
        }
      : await timedFetch(`${SUPABASE_URL}/auth/v1/settings`, {
          method: "GET",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            Accept: "application/json",
          },
        });

    setProbe({ website, supabase });
    setLastRun(new Date().toLocaleString());
    setRunning(false);
  }, [running]);

  useEffect(() => {
    void runProbe();
    // Auto-run only once on page open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overall =
    probe.website.state === "reachable" && probe.supabase.state === "reachable"
      ? "两条网络链路都可达"
      : probe.website.state === "reachable" && probe.supabase.state === "unreachable"
        ? "LifeSpace 可达，但 Supabase Auth 不可达"
        : probe.website.state === "unreachable"
          ? "LifeSpace 本站连接异常"
          : "正在测试";

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <h1 style={titleStyle}>网络诊断</h1>
        <p style={introStyle}>
          用于排查“不打开 VPN 无法登录”。页面不会提交账号、密码，也不会修改任何数据。
        </p>

        <div style={summaryStyle}>{overall}</div>

        <ProbeRow
          label="LifeSpace 网站"
          target={typeof window === "undefined" ? "life-space.uk" : window.location.host}
          result={probe.website}
        />
        <ProbeRow
          label="Supabase Auth"
          target={supabaseHost}
          result={probe.supabase}
        />

        <div style={metaStyle}>
          <span>浏览器网络状态：{typeof navigator !== "undefined" && navigator.onLine ? "在线" : "离线"}</span>
          {lastRun ? <span>测试时间：{lastRun}</span> : null}
        </div>

        <button
          type="button"
          onClick={() => void runProbe()}
          disabled={running}
          style={buttonStyle}
        >
          {running ? "测试中…" : "重新测试"}
        </button>

        <p style={hintStyle}>
          请先关闭 VPN 打开本页测试并截图；再打开 VPN 点“重新测试”再截图。重点看 Supabase Auth 一行。
        </p>
      </section>
    </main>
  );
}

function ProbeRow({
  label,
  target,
  result,
}: {
  label: string;
  target: string;
  result: ProbeResult;
}) {
  const display = getStateDisplay(result.state);

  return (
    <div style={rowStyle}>
      <div style={rowMainStyle}>
        <strong style={labelStyle}>{label}</strong>
        <span style={targetStyle}>{target}</span>
      </div>
      <div style={rowResultStyle}>
        <span style={{ ...badgeStyle, ...display.style }}>{display.label}</span>
        {typeof result.durationMs === "number" ? (
          <span style={durationStyle}>{result.durationMs} ms</span>
        ) : null}
      </div>
      {result.detail ? <div style={detailStyle}>{result.detail}</div> : null}
      {typeof result.status === "number" ? (
        <div style={statusStyle}>HTTP {result.status}</div>
      ) : null}
    </div>
  );
}

function getStateDisplay(state: ProbeState) {
  if (state === "reachable") {
    return {
      label: "可达",
      style: { background: "#edf7e9", color: "#2f6a31", borderColor: "#b9d6b3" },
    };
  }
  if (state === "unreachable") {
    return {
      label: "不可达",
      style: { background: "#fff2ef", color: "#9a4338", borderColor: "#e5bdb7" },
    };
  }
  if (state === "running") {
    return {
      label: "测试中",
      style: { background: "#f3f5f1", color: "#657160", borderColor: "#d9e0d5" },
    };
  }
  return {
    label: "未测试",
    style: { background: "#f3f5f1", color: "#657160", borderColor: "#d9e0d5" },
  };
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  padding: "24px 14px 96px",
  background: "#f7f9f4",
  color: "#263527",
};

const cardStyle: CSSProperties = {
  width: "min(680px, 100%)",
  margin: "0 auto",
  padding: "22px 18px",
  border: "1px solid #e1e8de",
  borderRadius: 18,
  background: "#fff",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 24,
  lineHeight: 1.3,
};

const introStyle: CSSProperties = {
  margin: "10px 0 18px",
  color: "#657160",
  fontSize: 14,
  lineHeight: 1.65,
};

const summaryStyle: CSSProperties = {
  marginBottom: 14,
  padding: "11px 12px",
  borderRadius: 12,
  background: "#f0f5ed",
  color: "#355b35",
  fontSize: 14,
  fontWeight: 700,
};

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "5px 10px",
  padding: "15px 0",
  borderBottom: "1px solid #edf1ea",
};

const rowMainStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 3,
};

const labelStyle: CSSProperties = {
  fontSize: 16,
};

const targetStyle: CSSProperties = {
  overflow: "hidden",
  color: "#7a8578",
  fontSize: 12,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const rowResultStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
};

const badgeStyle: CSSProperties = {
  padding: "4px 8px",
  border: "1px solid",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const durationStyle: CSSProperties = {
  color: "#7a8578",
  fontSize: 11,
  whiteSpace: "nowrap",
};

const detailStyle: CSSProperties = {
  gridColumn: "1 / -1",
  color: "#667463",
  fontSize: 12,
  lineHeight: 1.5,
};

const statusStyle: CSSProperties = {
  gridColumn: "1 / -1",
  color: "#7a8578",
  fontSize: 11,
};

const metaStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  marginTop: 16,
  color: "#7a8578",
  fontSize: 12,
};

const buttonStyle: CSSProperties = {
  width: "100%",
  minHeight: 46,
  marginTop: 18,
  border: "1px solid #4f844b",
  borderRadius: 999,
  background: "#4f844b",
  color: "#fff",
  fontSize: 15,
  fontWeight: 800,
};

const hintStyle: CSSProperties = {
  margin: "14px 0 0",
  color: "#6f7b69",
  fontSize: 13,
  lineHeight: 1.6,
};
