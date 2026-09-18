import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listAuditEvents } from "../../api/endpoints";
import type { AuditEvent } from "../../api/types";
import { Notice, Spinner } from "../ui";

const ACTION_KEYS: Record<string, string> = {
  "employee.created": "employeeCreated",
  "employee.updated": "employeeUpdated",
  "employee.password_reset": "employeePasswordReset",
  "employee.archived": "employeeArchived",
  "employee.restored": "employeeRestored",
  "device.updated": "deviceUpdated",
  "device.revoked": "deviceRevoked",
  "device.restored": "deviceRestored",
  "member.role_changed": "memberRoleChanged",
  "member.monitoring_changed": "memberMonitoringChanged",
  "member.enrollment_created": "memberEnrollmentCreated",
  "member.enrollment_redeemed": "memberEnrollmentRedeemed",
};

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

function shortId(id: string): string {
  if (!id) return "";
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function detailsText(event: AuditEvent): string | null {
  const details = event.details ?? {};
  if (typeof details.display_name === "string" && details.display_name) {
    return details.display_name;
  }
  if (typeof details.label === "string" && details.label) {
    return details.label;
  }
  if (typeof details.from === "string" && typeof details.to === "string") {
    return `${details.from} → ${details.to}`;
  }
  if (Array.isArray(details.fields) && details.fields.length > 0) {
    return details.fields.filter((v): v is string => typeof v === "string").join(", ");
  }
  return null;
}

export function AuditLogCard({ businessId }: { businessId: string }) {
  const { t } = useTranslation("settings");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAuditEvents(businessId, 50);
      setEvents(res.events);
    } catch {
      setError(t("audit.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [businessId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () => events.map((event) => ({
      event,
      title: t(`audit.actions.${ACTION_KEYS[event.action] ?? "unknown"}`),
      details: detailsText(event),
    })),
    [events, t],
  );

  return (
    <div className="set-group">
      <div className="set-row" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="set-title">{t("audit.title")}</div>
          <div className="set-desc">{t("audit.desc")}</div>
        </div>
        <button
          type="button"
          className="actilens-btn actilens-btn--secondary actilens-btn--sm"
          disabled={loading}
          onClick={load}
        >
          {t("audit.refresh")}
        </button>
      </div>

      <div style={{ padding: "0 18px 16px" }}>
        {loading && <Spinner label={t("audit.loading")} />}
        {error && <Notice kind="danger">{error}</Notice>}
        {!loading && !error && rows.length === 0 && (
          <div className="muted" style={{ padding: "12px 0" }}>{t("audit.empty")}</div>
        )}
        {!loading && !error && rows.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map(({ event, title, details }) => (
              <div
                key={event.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) auto",
                  gap: 12,
                  alignItems: "start",
                  borderTop: "1px solid var(--border)",
                  paddingTop: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 650, fontSize: 13.5 }}>{title}</div>
                  <div className="muted" style={{ marginTop: 3, fontSize: 12, overflowWrap: "anywhere" }}>
                    {details ? `${details} · ` : ""}
                    {t(`audit.targets.${event.target_type}`, { defaultValue: event.target_type })}
                    {event.target_id ? ` ${shortId(event.target_id)}` : ""}
                  </div>
                </div>
                <time className="muted" style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                  {formatTime(event.created_at)}
                </time>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
