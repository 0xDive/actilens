import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listAuditEvents } from "../../api/endpoints";
import type { AuditEvent } from "../../api/types";
import { Alert, Button, Card, EmptyState, Skeleton } from "../ds";

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
  "member.purged": "memberPurged",
  "member.enrollment_created": "memberEnrollmentCreated",
  "member.enrollment_redeemed": "memberEnrollmentRedeemed",
};

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
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
    return details.fields
      .filter((value): value is string => typeof value === "string")
      .join(", ");
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
      const response = await listAuditEvents(businessId, 50);
      setEvents(response.events);
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
    () =>
      events.map((event) => ({
        event,
        title: t(`audit.actions.${ACTION_KEYS[event.action] ?? "unknown"}`),
        details: detailsText(event),
      })),
    [events, t],
  );

  return (
    <Card>
      <div className="report-card__head" style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h2 className="report-card__title">{t("audit.title")}</h2>
          <p className="report-card__subtitle">{t("audit.desc")}</p>
        </div>
        <Button variant="secondary" size="sm" disabled={loading} onClick={load}>
          {t("audit.refresh")}
        </Button>
      </div>

      {loading && (
        <div className="settings-audit-list" aria-hidden>
          {Array.from({ length: 4 }, (_, index) => (
            <div className="settings-audit-row" key={index}>
              <div>
                <Skeleton width="52%" height={14} />
                <div style={{ marginTop: 7 }}>
                  <Skeleton width="72%" height={12} />
                </div>
              </div>
              <Skeleton width={112} height={12} />
            </div>
          ))}
        </div>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      {!loading && !error && rows.length === 0 && (
        <EmptyState
          title={t("audit.empty")}
          description={t("audit.v1.emptyDescription")}
        />
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="settings-audit-list">
          {rows.map(({ event, title, details }) => (
            <div className="settings-audit-row" key={event.id}>
              <div>
                <div className="settings-audit-row__title">{title}</div>
                <div className="settings-audit-row__meta">
                  {details ? `${details} · ` : ""}
                  {t(`audit.targets.${event.target_type}`, {
                    defaultValue: event.target_type,
                  })}
                  {event.target_id ? ` ${shortId(event.target_id)}` : ""}
                </div>
              </div>
              <time>{formatTime(event.created_at)}</time>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
