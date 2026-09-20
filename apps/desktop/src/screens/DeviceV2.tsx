import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { call as invoke } from "../api";
import { useRuntime } from "../runtime";
import type { DiagnosticsReport } from "../runtimeTypes";

function formatTime(ts: number, fallback: string) {
  return ts ? new Date(ts * 1000).toLocaleString() : fallback;
}

export function Device() {
  const { t } = useTranslation("desktop");
  const { state, refresh } = useRuntime();
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  if (!state) return <div className="desktop-v2-loading">{t("common.loading")}</div>;
  const runtime = state;

  async function openWeb() {
    try {
      const url = await invoke<string>("web_dashboard_url");
      await openUrl(url);
    } catch {
      // Diagnostics remain available even when opening the browser fails.
    }
  }

  async function reconnectDevice() {
    setBusy(true);
    try {
      await invoke<string>("prepare_device_reconnect");
      setReport(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function runDiagnostics() {
    setBusy(true);
    try {
      setReport(await invoke<DiagnosticsReport>("runtime_diagnostics"));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1400);
    } catch {
      // Clipboard failure is non-fatal.
    }
  }

  async function copyReport() {
    if (!report) return;
    const text = [
      `ActiLens ${runtime.app_version}`,
      `${runtime.os} ${runtime.arch}`,
      `Device: ${runtime.device}`,
      `Connection: ${runtime.connection}`,
      `Sync: ${runtime.sync}`,
      `Pending: ${runtime.pending}`,
      "",
      ...report.checks.map((check) => `[${check.state.toUpperCase()}] ${check.key}: ${check.detail}`),
    ].join("\n");
    await copy(text, "report");
  }

  return (
    <div className="desktop-v2-page">
      <div className="desktop-v2-page-head">
        <div>
          <span className="desktop-v2-kicker">{t("device.thisDevice")}</span>
          <h2>{runtime.hostname}</h2>
          <p>{runtime.os} · {runtime.arch}</p>
        </div>
        <div className="desktop-v2-page-actions">
          {runtime.device === "revoked" && (
            <button
              className="actilens-btn actilens-btn--primary"
              disabled={busy}
              onClick={() => void reconnectDevice()}
            >
              {t("device.reconnect")}
            </button>
          )}
          {!runtime.local_only && (
            <button className="actilens-btn actilens-btn--secondary" onClick={() => void openWeb()}>
              {t("actions.openWeb")} ↗
            </button>
          )}
        </div>
      </div>

      {runtime.device === "revoked" && (
        <section className="desktop-v2-card desktop-v2-device-warning">
          <div>
            <span className="desktop-v2-kicker">{t("device.revokedTitle")}</span>
            <h3>{t("device.reconnect")}</h3>
            <p>{t("device.reconnectBody")}</p>
          </div>
        </section>
      )}

      <div className="desktop-v2-grid desktop-v2-grid--two">
        <section className="desktop-v2-card">
          <span className="desktop-v2-kicker">{t("device.installation")}</span>
          <div className="desktop-v2-data-list">
            <div><span>{t("device.version")}</span><strong>v{runtime.app_version}</strong></div>
            <div><span>{t("device.deviceState")}</span><strong>{t(`deviceState.${runtime.device}`)}</strong></div>
            <div>
              <span>{t("device.deviceId")}</span>
              <button className="desktop-v2-copy" onClick={() => void copy(runtime.device_id, "device")}>
                <code>{runtime.device_id}</code>
                <span>{copied === "device" ? t("actions.copied") : t("actions.copy")}</span>
              </button>
            </div>
            {runtime.email && <div><span>{t("device.account")}</span><strong>{runtime.email}</strong></div>}
            {runtime.business_name && (
              <div><span>{t("device.organization")}</span><strong>{runtime.business_name}</strong></div>
            )}
            {!runtime.business_name && runtime.business_id && (
              <div><span>{t("device.organizationId")}</span><code>{runtime.business_id}</code></div>
            )}
          </div>
        </section>

        <section className="desktop-v2-card">
          <span className="desktop-v2-kicker">{t("device.connectionSync")}</span>
          <div className="desktop-v2-data-list">
            <div><span>{t("device.connection")}</span><strong>{t(`connection.${runtime.connection}`)}</strong></div>
            <div><span>{t("device.lastSync")}</span><strong>{formatTime(runtime.last_sync_ts, t("time.never"))}</strong></div>
            <div>
              <span>{t("device.queue")}</span>
              <strong>
                {runtime.local_only
                  ? t("device.localStorage")
                  : runtime.pending
                    ? t("device.pendingCount", { count: runtime.pending })
                    : t("device.allSynced")}
              </strong>
            </div>
            <div><span>{t("device.browserBridge")}</span><strong>{runtime.browser_bridge_ready ? t("device.ready") : t("device.notReady")}</strong></div>
          </div>
        </section>
      </div>

      <section className="desktop-v2-card">
        <div className="desktop-v2-card__head">
          <div>
            <span className="desktop-v2-kicker">{t("diagnostics.title")}</span>
            <h3>{t("diagnostics.subtitle")}</h3>
          </div>
          <button className="actilens-btn actilens-btn--secondary" disabled={busy} onClick={() => void runDiagnostics()}>
            {busy ? t("diagnostics.running") : t("diagnostics.run")}
          </button>
        </div>

        {report && (
          <>
            <div className="desktop-diagnostics">
              {report.checks.map((check) => (
                <div className="desktop-diagnostic-row" key={check.key}>
                  <span className={`desktop-diagnostic-state is-${check.state}`} />
                  <div>
                    <strong>{t(`diagnostics.checks.${check.key}`, { defaultValue: check.key })}</strong>
                    <span>{check.detail}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="desktop-v2-card__footer">
              <button className="actilens-btn actilens-btn--ghost" onClick={() => void copyReport()}>
                {copied === "report" ? t("actions.copied") : t("diagnostics.copy")}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
