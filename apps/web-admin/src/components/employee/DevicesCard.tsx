import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listEmployeeDevices, updateDevice } from "../../api/endpoints";
import type { Device } from "../../api/types";
import { Notice, Spinner } from "../ui";

function fmtTimestamp(ts: number | null, never: string): string {
  if (!ts) return never;
  return new Date(ts * 1000).toLocaleString();
}

function displayName(device: Device, unnamed: string): string {
  return device.label || device.hostname || unnamed;
}

function shortID(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export function DevicesCard({ employeeId }: { employeeId: string }) {
  const { t } = useTranslation("dashboard");
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyID, setBusyID] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listEmployeeDevices(employeeId);
      setDevices(res.devices);
    } catch {
      setError(t("detail.devices.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [employeeId, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function rename(device: Device) {
    const value = window.prompt(
      t("detail.devices.renamePrompt"),
      device.label || device.hostname || "",
    );
    if (value === null) return;
    setBusyID(device.id);
    try {
      const res = await updateDevice(device.id, { label: value.trim() });
      setDevices((prev) => prev.map((d) => (d.id === device.id ? res.device : d)));
    } catch {
      window.alert(t("detail.devices.actionFailed"));
    } finally {
      setBusyID(null);
    }
  }

  async function toggleRevoked(device: Device) {
    const currentlyRevoked = !!device.revoked_at;
    const ok = window.confirm(
      t(currentlyRevoked ? "detail.devices.confirmRestore" : "detail.devices.confirmRevoke"),
    );
    if (!ok) return;
    setBusyID(device.id);
    try {
      const res = await updateDevice(device.id, { revoked: !currentlyRevoked });
      setDevices((prev) => prev.map((d) => (d.id === device.id ? res.device : d)));
    } catch {
      window.alert(t("detail.devices.actionFailed"));
    } finally {
      setBusyID(null);
    }
  }

  return (
    <section className="actilens-card actilens-card--default" style={{ marginBottom: 20, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>{t("detail.devices.title")}</h2>
          <p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
            {t("detail.devices.subtitle")}
          </p>
        </div>
      </div>

      {loading && <Spinner label={t("detail.devices.loading")} />}
      {error && <Notice kind="danger">{error}</Notice>}
      {!loading && !error && devices.length === 0 && (
        <div style={{ color: "var(--text-muted)", fontSize: 14 }}>{t("detail.devices.empty")}</div>
      )}

      {!loading && !error && devices.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {devices.map((device) => {
            const revoked = !!device.revoked_at;
            const name = displayName(device, t("detail.devices.unnamed"));
            const meta = [device.platform, device.arch].filter(Boolean).join(" · ");
            return (
              <div
                key={device.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  opacity: revoked ? 0.72 : 1,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong>{name}</strong>
                    <span
                      style={{
                        padding: "2px 7px",
                        borderRadius: 999,
                        fontSize: 11,
                        background: revoked ? "var(--danger-soft)" : "var(--positive-soft)",
                        color: revoked ? "var(--danger)" : "var(--positive)",
                      }}
                    >
                      {t(revoked ? "detail.devices.revoked" : "detail.devices.active")}
                    </span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 12, color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                    {meta || shortID(device.id)}
                    {device.app_version ? ` · ${t("detail.devices.version", { version: device.app_version })}` : ""}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
                    {t("detail.devices.lastSeen", { value: fmtTimestamp(device.last_seen, t("detail.devices.never")) })}
                    {" · "}
                    {t("detail.devices.firstSeen", { value: fmtTimestamp(device.first_seen, t("detail.devices.never")) })}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    className="actilens-btn actilens-btn--ghost"
                    disabled={busyID === device.id}
                    onClick={() => rename(device)}
                  >
                    {t("detail.devices.rename")}
                  </button>
                  <button
                    className="actilens-btn actilens-btn--ghost"
                    disabled={busyID === device.id}
                    onClick={() => toggleRevoked(device)}
                  >
                    {t(revoked ? "detail.devices.restore" : "detail.devices.revoke")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
