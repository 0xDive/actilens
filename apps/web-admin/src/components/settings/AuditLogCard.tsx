import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  listAuditEvents,
  listBusinessEmployees,
  listFormerMembers,
} from "../../api/endpoints";
import type { AuditEvent, Employee } from "../../api/types";
import {
  Alert,
  Button,
  Card,
  cx,
  Dialog,
  EmptyState,
  SelectMenu,
  Skeleton,
} from "../ds";

const PREVIEW_COUNT = 6;
const DEFAULT_PAGE_SIZE = 7;
const AUDIT_ROW_HEIGHT = 82;
const MAX_PAGE_SIZE = 20;

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
  "member.blocked": "memberBlocked",
  "member.unblocked": "memberUnblocked",
  "member.removed": "memberRemoved",
  "member.restored": "memberRestored",
  "organization.created": "organizationCreated",
  "organization.renamed": "organizationRenamed",
  "organization.kind_changed": "organizationKindChanged",
  "organization.timezone_changed": "organizationTimezoneChanged",
  "organization.week_start_changed": "organizationWeekStartChanged",
  "organization.archived": "organizationArchived",
  "organization.restored": "organizationRestored",
  "organization.owner_transferred": "organizationOwnerTransferred",
  "organization.deletion_scheduled": "organizationDeletionScheduled",
  "organization.deletion_cancelled": "organizationDeletionCancelled",
  "settings.changed": "settingsChanged",
  "settings.collection_changed": "settingsCollectionChanged",
  "settings.screenshot_changed": "settingsScreenshotChanged",
  "settings.retention_changed": "settingsRetentionChanged",
  "settings.enrollment_changed": "settingsEnrollmentChanged",
  "settings.device_limit_changed": "settingsDeviceLimitChanged",
  "settings.default_monitoring_changed": "settingsDefaultMonitoringChanged",
  "settings.privacy_rule_created": "privacyRuleCreated",
  "settings.privacy_rule_changed": "privacyRuleChanged",
  "settings.privacy_rule_deleted": "privacyRuleDeleted",
};

const LEGACY_CHANGE_FIELD: Record<string, string> = {
  "member.role_changed": "role",
  "organization.renamed": "organization_name",
  "organization.kind_changed": "organization_kind",
  "organization.timezone_changed": "timezone",
  "organization.week_start_changed": "week_starts_on",
};

type AuditSnapshot = Record<string, unknown>;

type AuditChangeView = {
  field: string;
  before: unknown;
  after: unknown;
};

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

function shortId(id: string): string {
  if (!id) return "";
  return id.length > 12 ? id.slice(0, 8) + "…" + id.slice(-4) : id;
}

function asRecord(value: unknown): AuditSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as AuditSnapshot;
}

function readString(record: AuditSnapshot | null, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

function snapshotName(snapshot: AuditSnapshot | null): string {
  for (const key of [
    "display_name",
    "name",
    "label",
    "pattern",
    "username",
    "email",
    "hostname",
  ]) {
    const value = readString(snapshot, key);
    if (value) return value;
  }
  return "";
}

function snapshotSecondary(snapshot: AuditSnapshot | null, fallbackId: string): string {
  const email = readString(snapshot, "email");
  const username = readString(snapshot, "username");
  if (email && username) return email + " · @" + username;
  if (email) return email;
  if (username) return "@" + username;
  return fallbackId ? shortId(fallbackId) : "";
}

function extractChanges(event: AuditEvent): AuditChangeView[] {
  const details = event.details ?? {};
  if (Array.isArray(details.changes)) {
    const parsed = details.changes
      .map((value) => asRecord(value))
      .filter((value): value is AuditSnapshot => Boolean(value))
      .filter((value) => typeof value.field === "string")
      .map((value) => ({
        field: String(value.field),
        before: value.before,
        after: value.after,
      }));
    if (parsed.length > 0) return parsed;
  }

  const legacyField = LEGACY_CHANGE_FIELD[event.action];
  if (
    legacyField &&
    (Object.prototype.hasOwnProperty.call(details, "from") ||
      Object.prototype.hasOwnProperty.call(details, "to"))
  ) {
    return [{ field: legacyField, before: details.from, after: details.to }];
  }

  if (
    event.action === "member.monitoring_changed" &&
    Object.prototype.hasOwnProperty.call(details, "enabled")
  ) {
    return [{ field: "monitoring_enabled", before: undefined, after: details.enabled }];
  }

  const values = asRecord(details.values);
  if (Array.isArray(details.fields) && values) {
    return details.fields
      .filter((value): value is string => typeof value === "string")
      .map((field) => ({
        field,
        before: undefined,
        after: values[field],
      }));
  }

  const result: AuditChangeView[] = [];
  if (event.action === "employee.updated") {
    for (const field of ["display_name", "active"]) {
      if (Object.prototype.hasOwnProperty.call(details, field)) {
        result.push({
          field: field === "active" ? "account_active" : field,
          before: undefined,
          after: details[field],
        });
      }
    }
  }
  if (event.action === "device.updated" && "label" in details) {
    result.push({ field: "device_label", before: undefined, after: details.label });
  }
  if (event.action === "settings.privacy_rule_changed") {
    for (const [key, field] of [
      ["kind", "privacy_kind"],
      ["match_type", "privacy_match_type"],
      ["pattern", "privacy_pattern"],
      ["enabled", "privacy_enabled"],
    ] as const) {
      if (Object.prototype.hasOwnProperty.call(details, key)) {
        result.push({ field, before: undefined, after: details[key] });
      }
    }
  }
  return result;
}

function metadataEntries(details: Record<string, unknown>) {
  const hidden = new Set([
    "schema_version",
    "actor",
    "target",
    "changes",
    "from",
    "to",
    "fields",
    "values",
  ]);
  return Object.entries(details).filter(([key]) => !hidden.has(key));
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = value;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return (current >= 10 || index === 0 ? current.toFixed(0) : current.toFixed(1)) + " " + units[index];
}

export function AuditLogCard({ businessId }: { businessId: string }) {
  const { t } = useTranslation("settings");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [people, setPeople] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const listViewportRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [auditResponse, activeResponse, formerResponse] = await Promise.all([
        listAuditEvents(businessId, 200),
        listBusinessEmployees(businessId),
        listFormerMembers(businessId),
      ]);
      setEvents(auditResponse.events);
      const byId = new Map<string, Employee>();
      for (const person of [...activeResponse.employees, ...formerResponse.employees]) {
        byId.set(person.id, person);
      }
      setPeople([...byId.values()]);
    } catch {
      setError(t("audit.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [businessId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  );

  function fieldLabel(field: string): string {
    return t("audit.fields." + field, {
      defaultValue: field.replaceAll("_", " "),
    });
  }

  function personName(userId: string): string {
    return (
      peopleById.get(userId)?.display_name ||
      t("audit.unknownUser", { id: shortId(userId) })
    );
  }

  function formatValue(field: string, value: unknown): string {
    if (value === undefined) return t("audit.values.notRecorded");
    if (value === null || value === "") {
      if (
        field.endsWith("_retention_days") ||
        field === "device_limit"
      ) {
        return t("audit.values.unlimited");
      }
      return t("audit.values.none");
    }

    if (field === "owner_user_id" && typeof value === "string") {
      return personName(value);
    }

    if (field === "role" && typeof value === "string") {
      return t("audit.values.roles." + value, { defaultValue: value });
    }

    if (
      (field === "membership_status" || field === "organization_status") &&
      typeof value === "string"
    ) {
      return t("audit.values.statuses." + value, { defaultValue: value });
    }

    if (field === "organization_kind" && typeof value === "string") {
      return t("audit.values.organizationKinds." + value, { defaultValue: value });
    }

    if (field === "week_starts_on" && typeof value === "number") {
      return t("audit.values.weekdays." + String(value), { defaultValue: String(value) });
    }

    if (field === "screenshot_capture_scope" && typeof value === "string") {
      return t("audit.values.scopes." + value, { defaultValue: value });
    }

    if (field === "privacy_kind" && typeof value === "string") {
      return t("audit.values.privacyKinds." + value, { defaultValue: value });
    }

    if (field === "privacy_match_type" && typeof value === "string") {
      return t("audit.values.matchTypes." + value, { defaultValue: value });
    }

    if (field === "exists" && typeof value === "boolean") {
      return value ? t("audit.values.exists") : t("audit.values.deleted");
    }

    if (
      (field === "deletion_scheduled_at" || field === "expires_at") &&
      (typeof value === "string" || typeof value === "number")
    ) {
      const date = new Date(
        typeof value === "number" && value < 100000000000 ? value * 1000 : value,
      );
      if (!Number.isNaN(date.valueOf())) return date.toLocaleString();
    }

    if (typeof value === "boolean") {
      return value ? t("audit.values.on") : t("audit.values.off");
    }

    if (typeof value === "number" && field.endsWith("_days")) {
      return t("audit.values.days", { count: value });
    }

    if (
      typeof value === "number" &&
      (field.endsWith("_s") || field === "enrollment_token_ttl_s")
    ) {
      if (value % 3600 === 0) {
        return t("audit.values.hours", { count: value / 3600 });
      }
      if (value % 60 === 0) {
        return t("audit.values.minutes", { count: value / 60 });
      }
      return t("audit.values.seconds", { count: value });
    }

    if (Array.isArray(value)) {
      return value.length > 0 ? value.map(String).join(", ") : t("audit.values.none");
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  }

  function metadataValue(key: string, value: unknown): string {
    if (key === "bytes_freed" && typeof value === "number") return formatBytes(value);
    if (
      (key.endsWith("_user_id") || key === "employee_id") &&
      typeof value === "string"
    ) {
      return personName(value) + " · " + shortId(value);
    }
    if (
      (key === "expires_at" || key === "deletion_scheduled_at") &&
      (typeof value === "string" || typeof value === "number")
    ) {
      return formatValue(key, value);
    }
    return formatValue(key, value);
  }

  const rows = useMemo(
    () =>
      events.map((event) => {
        const details = event.details ?? {};
        const actorSnapshot = asRecord(details.actor);
        const targetSnapshot = asRecord(details.target);
        const actor = peopleById.get(event.actor_user_id);
        const target =
          event.target_type === "member" || event.target_type === "employee"
            ? peopleById.get(event.target_id)
            : undefined;

        const actorName =
          snapshotName(actorSnapshot) ||
          actor?.display_name ||
          t("audit.unknownUser", { id: shortId(event.actor_user_id) });

        const targetType = t("audit.targets." + event.target_type, {
          defaultValue: event.target_type,
        });
        const targetName =
          snapshotName(targetSnapshot) ||
          target?.display_name ||
          (event.target_id
            ? targetType + " " + shortId(event.target_id)
            : targetType);

        const title = t(
          "audit.actions." + (ACTION_KEYS[event.action] ?? "unknown"),
        );
        const changes = extractChanges(event);
        const searchable = [
          title,
          actorName,
          targetName,
          event.action,
          event.target_type,
          event.target_id,
          JSON.stringify(details),
        ]
          .join(" ")
          .toLocaleLowerCase();

        return {
          event,
          title,
          actorSnapshot,
          targetSnapshot,
          actorName,
          targetName,
          changes,
          searchable,
        };
      }),
    [events, peopleById, t],
  );

  const userOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const person of people) {
      names.set(person.id, person.display_name);
    }
    for (const row of rows) {
      if (row.event.actor_user_id) {
        names.set(row.event.actor_user_id, row.actorName);
      }
      if (
        row.event.target_id &&
        (row.event.target_type === "member" ||
          row.event.target_type === "employee")
      ) {
        names.set(row.event.target_id, row.targetName);
      }
    }
    return [
      { value: "", label: t("audit.allUsers") },
      ...[...names.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    ];
  }, [people, rows, t]);

  const actionOptions = useMemo(
    () => [
      { value: "", label: t("audit.allActions") },
      ...[...new Set(events.map((event) => event.action))]
        .map((action) => ({
          value: action,
          label: t(
            "audit.actions." + (ACTION_KEYS[action] ?? "unknown"),
          ),
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    ],
    [events, t],
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      const event = row.event;
      if (
        userFilter &&
        event.actor_user_id !== userFilter &&
        event.target_id !== userFilter
      ) {
        return false;
      }
      if (actionFilter && event.action !== actionFilter) return false;
      return !query || row.searchable.includes(query);
    });
  }, [actionFilter, rows, search, userFilter]);

  useEffect(() => {
    setPage(0);
    setSelectedEventId(null);
  }, [actionFilter, search, userFilter]);

  useLayoutEffect(() => {
    if (!open) return;
    const viewport = listViewportRef.current;
    if (!viewport) return;

    const updatePageSize = () => {
      const height = viewport.clientHeight;
      if (height <= 0) return;
      const next = Math.max(
        1,
        Math.min(MAX_PAGE_SIZE, Math.floor(height / AUDIT_ROW_HEIGHT)),
      );
      setPageSize((current) => (current === next ? current : next));
    };

    updatePageSize();
    const observer = new ResizeObserver(updatePageSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [open]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filteredRows.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize,
  );

  useEffect(() => {
    if (!open) return;
    setSelectedEventId((current) => {
      if (current != null && filteredRows.some((row) => row.event.id === current)) {
        return current;
      }
      return pageRows[0]?.event.id ?? null;
    });
  }, [filteredRows, open, safePage, pageSize]);

  const selectedRow =
    filteredRows.find((row) => row.event.id === selectedEventId) ?? null;

  function changeSummary(row: (typeof rows)[number]): string {
    if (row.changes.length === 0) return "";
    const parts = row.changes.slice(0, 2).map((change) => {
      const label = fieldLabel(change.field);
      const after = formatValue(change.field, change.after);
      if (change.before === undefined) {
        return label + ": " + t("audit.changedTo", { value: after });
      }
      return (
        label +
        ": " +
        formatValue(change.field, change.before) +
        " → " +
        after
      );
    });
    const extra = row.changes.length - parts.length;
    if (extra > 0) parts.push(t("audit.moreChanges", { count: extra }));
    return parts.join(" · ");
  }

  function renderRow(row: (typeof rows)[number], selectable = false) {
    const summary = changeSummary(row);
    const selected = selectable && row.event.id === selectedEventId;
    return (
      <div
        className={cx(
          "settings-audit-row",
          selectable && "settings-audit-row--selectable",
          selected && "is-selected",
        )}
        key={row.event.id}
        role={selectable ? "button" : undefined}
        tabIndex={selectable ? 0 : undefined}
        aria-pressed={selectable ? selected : undefined}
        onClick={selectable ? () => setSelectedEventId(row.event.id) : undefined}
        onKeyDown={
          selectable
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedEventId(row.event.id);
                }
              }
            : undefined
        }
      >
        <div className="settings-audit-row__copy">
          <div className="settings-audit-row__title">{row.title}</div>
          <div className="settings-audit-row__context">
            <span>{row.actorName}</span>
            <span aria-hidden>→</span>
            <span>{row.targetName}</span>
          </div>
          {summary && (
            <div className="settings-audit-row__change" title={summary}>
              {summary}
            </div>
          )}
        </div>
        <div className="settings-audit-row__aside">
          <time>{formatTime(row.event.created_at)}</time>
          {selectable && <code>{row.event.action}</code>}
        </div>
      </div>
    );
  }

  function renderDetail() {
    if (!selectedRow) {
      return (
        <div className="settings-audit-detail__empty">
          <strong>{t("audit.detail.selectTitle")}</strong>
          <span>{t("audit.detail.selectDescription")}</span>
        </div>
      );
    }

    const event = selectedRow.event;
    const actorSecondary = snapshotSecondary(
      selectedRow.actorSnapshot,
      event.actor_user_id,
    );
    const targetSecondary = snapshotSecondary(
      selectedRow.targetSnapshot,
      event.target_id,
    );
    const metadata = metadataEntries(event.details ?? {});

    return (
      <>
        <div className="settings-audit-detail__header">
          <div>
            <div className="settings-audit-detail__eyebrow">
              {t("audit.detail.event", { id: event.id })}
            </div>
            <h3>{selectedRow.title}</h3>
          </div>
          <code>{event.action}</code>
        </div>

        <div className="settings-audit-detail__section">
          <div className="settings-audit-detail__label">{t("audit.detail.actor")}</div>
          <strong>{selectedRow.actorName}</strong>
          {actorSecondary && <span>{actorSecondary}</span>}
          <code>{event.actor_user_id}</code>
        </div>

        <div className="settings-audit-detail__section">
          <div className="settings-audit-detail__label">{t("audit.detail.target")}</div>
          <strong>{selectedRow.targetName}</strong>
          <span>
            {t("audit.targets." + event.target_type, {
              defaultValue: event.target_type,
            })}
            {targetSecondary ? " · " + targetSecondary : ""}
          </span>
          {event.target_id && <code>{event.target_id}</code>}
        </div>

        <div className="settings-audit-detail__section">
          <div className="settings-audit-detail__label">{t("audit.detail.changes")}</div>
          {selectedRow.changes.length === 0 ? (
            <span>{t("audit.detail.noChanges")}</span>
          ) : (
            <div className="settings-audit-change-list">
              {selectedRow.changes.map((change, index) => (
                <div className="settings-audit-change" key={change.field + "-" + index}>
                  <div className="settings-audit-change__field">
                    {fieldLabel(change.field)}
                  </div>
                  <div className="settings-audit-change__values">
                    <span className="settings-audit-change__before">
                      {formatValue(change.field, change.before)}
                    </span>
                    <span aria-hidden>→</span>
                    <span className="settings-audit-change__after">
                      {formatValue(change.field, change.after)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {metadata.length > 0 && (
          <div className="settings-audit-detail__section">
            <div className="settings-audit-detail__label">{t("audit.detail.metadata")}</div>
            <div className="settings-audit-metadata">
              {metadata.map(([key, value]) => (
                <div className="settings-audit-metadata__row" key={key}>
                  <span>
                    {t("audit.metadata." + key, {
                      defaultValue: fieldLabel(key),
                    })}
                  </span>
                  <strong>{metadataValue(key, value)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="settings-audit-detail__section settings-audit-detail__section--event">
          <div className="settings-audit-detail__label">{t("audit.detail.timestamp")}</div>
          <strong>{formatTime(event.created_at)}</strong>
          <span>{t("audit.detail.businessId")}</span>
          <code>{event.business_id}</code>
        </div>
      </>
    );
  }

  return (
    <>
      <Card>
        <div className="settings-audit-head">
          <div>
            <h2 className="report-card__title">{t("audit.title")}</h2>
            <p className="report-card__subtitle">{t("audit.desc")}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={() => setOpen(true)}
          >
            {t("audit.open")}
          </Button>
        </div>

        {loading && (
          <div className="settings-audit-list" aria-hidden>
            {Array.from({ length: 4 }, (_, index) => (
              <div className="settings-audit-row" key={index}>
                <div>
                  <Skeleton width="52%" height={14} />
                  <div className="settings-audit-skeleton-gap">
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
          <>
            <div className="settings-audit-list settings-audit-list--preview">
              {rows.slice(0, PREVIEW_COUNT).map((row) => renderRow(row))}
            </div>
            {rows.length > PREVIEW_COUNT && (
              <div className="settings-audit-preview-footer">
                <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
                  {t("audit.showAll", { count: rows.length })}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {open && (
        <Dialog
          title={t("audit.dialogTitle")}
          size="workspace"
          onClose={() => setOpen(false)}
          footer={
            <Button variant="primary" onClick={() => setOpen(false)}>
              {t("audit.close")}
            </Button>
          }
        >
          <div className="settings-audit-modal">
            <div className="settings-audit-filters">
              <input
                type="search"
                className="ds-input settings-audit-search"
                value={search}
                placeholder={t("audit.searchPlaceholder")}
                aria-label={t("audit.search")}
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
              <SelectMenu
                id="audit-user-filter"
                value={userFilter}
                ariaLabel={t("audit.userFilter")}
                options={userOptions}
                menuWidth={280}
                onChange={setUserFilter}
              />
              <SelectMenu
                id="audit-action-filter"
                value={actionFilter}
                ariaLabel={t("audit.actionFilter")}
                options={actionOptions}
                menuWidth={320}
                onChange={setActionFilter}
              />
              <Button variant="secondary" disabled={loading} onClick={() => void load()}>
                {t("audit.refresh")}
              </Button>
            </div>

            <div className="settings-audit-results-meta">
              {t("audit.results", { count: filteredRows.length })}
            </div>

            <div className="settings-audit-workspace">
              <div
                ref={listViewportRef}
                className="settings-audit-list-viewport"
              >
                {filteredRows.length === 0 ? (
                  <EmptyState
                    title={t("audit.noMatches")}
                    description={t("audit.noMatchesDescription")}
                  />
                ) : (
                  <div className="settings-audit-list settings-audit-list--modal">
                    {pageRows.map((row) => renderRow(row, true))}
                  </div>
                )}
              </div>

              <aside className="settings-audit-detail" aria-live="polite">
                {renderDetail()}
              </aside>
            </div>

            {filteredRows.length > 0 && pageCount > 1 && (
              <div className="settings-audit-pager">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={safePage === 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                >
                  {t("audit.previous")}
                </Button>
                <span>
                  {t("audit.page", {
                    current: safePage + 1,
                    total: pageCount,
                  })}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={safePage >= pageCount - 1}
                  onClick={() =>
                    setPage((current) => Math.min(pageCount - 1, current + 1))
                  }
                >
                  {t("audit.next")}
                </Button>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
