import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  cleanupScreenshots,
  previewRetention,
  updateBusinessSettings,
  type RetentionDataClass,
  type RetentionPreview,
} from "../api/endpoints";
import {
  ApiError,
  type BusinessSettingsPatch,
} from "../api/types";
import {
  Alert,
  Button,
  Card,
  Dialog,
  EmptyState,
  PageHeader,
  Skeleton,
} from "../components/ds";
import { useToast } from "../components/ToastProvider";
import { AuditLogCard } from "../components/settings/AuditLogCard";
import { OrganizationSettingsCard } from "../components/settings/OrganizationSettingsCard";
import { MonitoringSettingsCard } from "../components/settings/MonitoringSettingsCard";
import { ScreenshotPolicyCard } from "../components/settings/ScreenshotPolicyCard";
import { DeviceEnrollmentSettingsCard } from "../components/settings/DeviceEnrollmentSettingsCard";
import { PrivacyRulesDialog } from "../components/settings/PrivacyRulesDialog";
import { useBusinesses } from "../useBusinesses";
import { canManageSettings } from "../rbac";
import "../theme/settings-v1.css";

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

const CLEANUP_PRESETS = [7, 14, 30, 90];

type RetentionField =
  | "activity_retention_days"
  | "screenshot_retention_days"
  | "browser_retention_days"
  | "keystroke_retention_days";

type PendingRetentionChange = {
  field: RetentionField;
  dataClass: RetentionDataClass;
  value: number;
  preview: RetentionPreview;
};

const RETENTION_PRESETS: Record<RetentionField, Array<number | null>> = {
  activity_retention_days: [30, 90, 180, 365],
  screenshot_retention_days: [7, 14, 30, 90, null],
  browser_retention_days: [30, 90, 180, 365],
  keystroke_retention_days: [30, 90, 180, 365],
};

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-section" id={id}>
      <div className="settings-section__head">
        <h2 className="settings-section__title">{title}</h2>
        {description && (
          <p className="settings-section__description">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function SettingsRow({
  title,
  description,
  children,
  top = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  top?: boolean;
}) {
  return (
    <div className={`settings-row${top ? " settings-row--top" : ""}`}>
      <div className="settings-row__copy">
        <div className="settings-row__title">{title}</div>
        {description && (
          <div className="settings-row__description">{description}</div>
        )}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  disabled,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  disabled?: boolean;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="settings-segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={`settings-segmented__option${
            option.value === value ? " is-active" : ""
          }`}
          disabled={disabled}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Settings() {
  const { t } = useTranslation("settings");
  const { pushToast } = useToast();
  const { businesses, selected, selectedId, loading, reload } = useBusinesses();
  const mayManageSettings = canManageSettings(selected?.role);

  const [activeSection, setActiveSection] = useState("organization");
  const [saving, setSaving] = useState(false);
  const [pendingRetention, setPendingRetention] =
    useState<PendingRetentionChange | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(30);
  const [cleaning, setCleaning] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  async function savePatch(
    patch: BusinessSettingsPatch,
    successText: string,
  ) {
    if (!selectedId) return;

    setSaving(true);
    try {
      await updateBusinessSettings(selectedId, patch);
      await reload();
      pushToast({ title: successText, tone: "success" });
    } catch (error) {
      pushToast({
        title: error instanceof ApiError ? error.message : t("saveError"),
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  async function changeRetention(
    field: RetentionField,
    dataClass: RetentionDataClass,
    currentValue: number | null,
    nextValue: number | null,
  ) {
    if (!selectedId || currentValue === nextValue) return;

    const reduction =
      nextValue !== null &&
      (currentValue === null || nextValue < currentValue);

    if (!reduction) {
      await savePatch(
        { [field]: nextValue } as BusinessSettingsPatch,
        t("retention.saved"),
      );
      return;
    }

    setSaving(true);
    try {
      const preview = await previewRetention(selectedId, dataClass, nextValue);
      setPendingRetention({
        field,
        dataClass,
        value: nextValue,
        preview,
      });
    } catch (error) {
      pushToast({
        title: error instanceof ApiError ? error.message : t("retention.previewFailed"),
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  async function confirmRetentionReduction() {
    if (!selectedId || !pendingRetention) return;

    setSaving(true);
    try {
      await updateBusinessSettings(
        selectedId,
        { [pendingRetention.field]: pendingRetention.value } as BusinessSettingsPatch,
        true,
      );
      setPendingRetention(null);
      await reload();
      pushToast({ title: t("retention.saved"), tone: "success" });
    } catch (error) {
      pushToast({
        title: error instanceof ApiError ? error.message : t("saveError"),
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  async function runCleanup() {
    if (!selectedId) return;

    setCleaning(true);
    setDialogError(null);

    try {
      const response = await cleanupScreenshots(selectedId, cleanupDays);
      setCleanupOpen(false);
      pushToast({
        title: t("cleanup.removed", {
          count: response.deleted_count,
          size: formatBytes(response.bytes_freed),
        }),
        tone: "success",
      });
    } catch (error) {
      setDialogError(
        error instanceof ApiError ? error.message : t("cleanup.failed"),
      );
    } finally {
      setCleaning(false);
    }
  }

  const nav = [
    ["organization", t("v1.sections.organization")],
    ["monitoring", t("v1.sections.monitoring")],
    ["screenshots", t("v1.sections.screenshots")],
    ["devices", t("v1.sections.devices")],
    ["storage", t("v1.sections.storage")],
    ["audit", t("v1.sections.audit")],
  ] as const;

  function goToSection(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="settings-v1">
      <PageHeader
        title={t("title")}
        subtitle={
          selected
            ? t("v1.subtitle", { name: selected.name })
            : undefined
        }
      />

      {loading && (
        <div className="settings-layout" aria-hidden>
          <Skeleton width={180} height={220} />
          <div className="settings-content">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} width="100%" height={180} />
            ))}
          </div>
        </div>
      )}

      {!loading && businesses.length === 0 && (
        <EmptyState
          title={t("noBusinesses")}
          description={t("v1.noBusinessDescription")}
        />
      )}

      {selected && !mayManageSettings && (
        <Alert tone="info">{t("roleDenied")}</Alert>
      )}

      {selected && mayManageSettings && (
        <div className="settings-layout">
          <nav className="settings-nav" aria-label={t("v1.sectionNavigation")}>
            {nav.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`settings-nav__item${
                  activeSection === id ? " is-active" : ""
                }`}
                onClick={() => goToSection(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            <SettingsSection
              id="organization"
              title={t("v1.sections.organization")}
              description={t("v1.organization.description")}
            >
              <OrganizationSettingsCard
                access={{ business: selected, role: selected.role }}
                onReload={reload}
              />
            </SettingsSection>

            <SettingsSection
              id="monitoring"
              title={t("v1.sections.monitoring")}
              description={t("v1.monitoring.description")}
            >
              <MonitoringSettingsCard
                access={{ business: selected, role: selected.role }}
                onReload={reload}
              />
            </SettingsSection>

            <SettingsSection
              id="screenshots"
              title={t("v1.sections.screenshots")}
              description={t("v1.screenshots.description")}
            >
              <ScreenshotPolicyCard
                access={{ business: selected, role: selected.role }}
                onReload={reload}
                onManagePrivacy={() => setPrivacyOpen(true)}
              />
            </SettingsSection>

            <SettingsSection
              id="devices"
              title={t("v1.sections.devices")}
              description={t("v1.devices.description")}
            >
              <DeviceEnrollmentSettingsCard
                access={{ business: selected, role: selected.role }}
                onReload={reload}
              />
            </SettingsSection>

            <SettingsSection
              id="storage"
              title={t("v1.sections.storage")}
              description={t("v1.storage.description")}
            >
              <Card className="settings-card">
                {([
                  {
                    field: "activity_retention_days",
                    dataClass: "activity",
                    value: selected.activity_retention_days,
                    title: t("retention.activity"),
                    description: t("retention.activityDesc"),
                  },
                  {
                    field: "screenshot_retention_days",
                    dataClass: "screenshots",
                    value: selected.screenshot_retention_days,
                    title: t("retention.screenshots"),
                    description: t("retention.screenshotsDesc"),
                  },
                  {
                    field: "browser_retention_days",
                    dataClass: "browser",
                    value: selected.browser_retention_days,
                    title: t("retention.browser"),
                    description: t("retention.browserDesc"),
                  },
                  {
                    field: "keystroke_retention_days",
                    dataClass: "keystrokes",
                    value: selected.keystroke_retention_days,
                    title: t("retention.keystrokes"),
                    description: t("retention.keystrokesDesc"),
                  },
                ] as const).map((item) => (
                  <SettingsRow
                    key={item.field}
                    title={item.title}
                    description={item.description}
                  >
                    <Segmented
                      value={String(item.value)}
                      ariaLabel={item.title}
                      disabled={saving}
                      options={RETENTION_PRESETS[item.field].map((days) => ({
                        value: String(days),
                        label:
                          days === null
                            ? t("presets.never")
                            : t("presets.days", { count: days }),
                      }))}
                      onChange={(value) =>
                        changeRetention(
                          item.field,
                          item.dataClass,
                          item.value,
                          value === "null" ? null : Number(value),
                        )
                      }
                    />
                  </SettingsRow>
                ))}

                <SettingsRow
                  title={t("cleanup.title")}
                  description={t("cleanup.desc", {
                    name: selected.name,
                  })}
                >
                  <Button
                    variant="danger-ghost"
                    size="sm"
                    disabled={cleaning}
                    onClick={() => {
                      setDialogError(null);
                      setCleanupOpen(true);
                    }}
                  >
                    {t("cleanup.button")}
                  </Button>
                </SettingsRow>
              </Card>
            </SettingsSection>

            {selectedId && (
              <SettingsSection
                id="audit"
                title={t("v1.sections.audit")}
                description={t("v1.audit.description")}
              >
                <AuditLogCard businessId={selectedId} />
              </SettingsSection>
            )}

          </div>
        </div>
      )}

      {selectedId && (
        <PrivacyRulesDialog
          businessId={selectedId}
          open={privacyOpen}
          onClose={() => setPrivacyOpen(false)}
        />
      )}

      {pendingRetention && (
        <Dialog
          title={t("retention.confirmTitle")}
          size="confirm"
          onClose={() => !saving && setPendingRetention(null)}
          closeOnBackdrop={!saving}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => setPendingRetention(null)}
              >
                {t("retention.cancel")}
              </Button>
              <Button
                variant="danger"
                loading={saving}
                onClick={confirmRetentionReduction}
              >
                {t("retention.confirm")}
              </Button>
            </>
          }
        >
          <div className="settings-dialog-stack">
            <Alert tone="warning">
              {pendingRetention.dataClass === "screenshots"
                ? t("retention.previewScreenshots", {
                    count: pendingRetention.preview.affected_count,
                    size: formatBytes(pendingRetention.preview.bytes_freed),
                    days: pendingRetention.value,
                  })
                : t("retention.previewRows", {
                    count: pendingRetention.preview.affected_count,
                    days: pendingRetention.value,
                  })}
            </Alert>
            <p className="settings-dialog-copy">
              {t("retention.workerNotice")}
            </p>
          </div>
        </Dialog>
      )}

      {cleanupOpen && selected && (
        <Dialog
          title={t("cleanup.modalTitle")}
          size="confirm"
          onClose={() => !cleaning && setCleanupOpen(false)}
          closeOnBackdrop={!cleaning}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={cleaning}
                onClick={() => setCleanupOpen(false)}
              >
                {t("cleanup.cancel")}
              </Button>
              <Button
                variant="danger"
                loading={cleaning}
                onClick={runCleanup}
              >
                {t("cleanup.delete", { days: cleanupDays })}
              </Button>
            </>
          }
        >
          <div className="settings-dialog-stack">
            <Alert tone="warning">
              {t("cleanup.warning", { days: cleanupDays })}
            </Alert>
            <Segmented
              value={cleanupDays}
              ariaLabel={t("cleanup.olderThanAriaLabel")}
              disabled={cleaning}
              options={CLEANUP_PRESETS.map((days) => ({
                value: days,
                label: t("presets.days", { count: days }),
              }))}
              onChange={setCleanupDays}
            />
            {dialogError && <Alert tone="danger">{dialogError}</Alert>}
          </div>
        </Dialog>
      )}
    </div>
  );
}
