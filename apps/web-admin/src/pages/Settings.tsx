import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  cleanupScreenshots,
  getPrivacyApps,
  updateBusinessSettings,
} from "../api/endpoints";
import {
  ApiError,
  type BusinessSettingsPatch,
  type PrivacyAppCategory,
  type ScreenshotMode,
} from "../api/types";
import { useAuth } from "../auth/AuthContext";
import {
  Alert,
  Button,
  Card,
  Dialog,
  EmptyState,
  PageHeader,
  Skeleton,
  TextField,
} from "../components/ds";
import { useToast } from "../components/ToastProvider";
import { AuditLogCard } from "../components/settings/AuditLogCard";
import { useBusinesses } from "../useBusinesses";
import { memberTerms } from "../terms";
import { canManageSettings } from "../rbac";
import "../theme/settings-v1.css";

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

const CLEANUP_PRESETS = [7, 14, 30, 90];

const INTERVAL_PRESETS = [
  { minutes: 1, value: 60 },
  { minutes: 5, value: 300 },
  { minutes: 10, value: 600 },
  { minutes: 15, value: 900 },
];

const IDLE_PRESETS = [
  { minutes: 1, value: 60 },
  { minutes: 3, value: 180 },
  { minutes: 5, value: 300 },
];

const RETENTION_PRESETS: Array<{ days: number | null; value: number | null }> = [
  { days: 7, value: 7 },
  { days: 14, value: 14 },
  { days: 30, value: 30 },
  { days: 90, value: 90 },
  { days: null, value: null },
];

function normalizeMode(mode: string | undefined): ScreenshotMode {
  return mode === "normal" || mode === "full_screen" ? "normal" : "privacy";
}

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

function ModeOption({
  label,
  description,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`settings-mode${selected ? " is-active" : ""}`}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="settings-mode__radio" aria-hidden />
      <span>
        <span className="settings-mode__label">{label}</span>
        <span className="settings-mode__description">{description}</span>
      </span>
    </button>
  );
}

export function Settings() {
  const { t } = useTranslation("settings");
  const { user } = useAuth();
  const { pushToast } = useToast();
  const { businesses, selected, selectedId, loading, reload } = useBusinesses();
  const terms = memberTerms(selected?.kind);
  const mayManageSettings = canManageSettings(selected?.role);

  const [activeSection, setActiveSection] = useState("organization");
  const [retention, setRetention] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [skipAppInput, setSkipAppInput] = useState("");
  const [skipOpen, setSkipOpen] = useState(false);
  const [privacyApps, setPrivacyApps] = useState<PrivacyAppCategory[]>([]);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(30);
  const [cleaning, setCleaning] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  useEffect(() => {
    getPrivacyApps()
      .then((response) => setPrivacyApps(response.categories))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selected) setRetention(selected.screenshot_retention_days);
  }, [selected]);

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

  function saveRetention(value: number | null) {
    setRetention(value);
    savePatch({ screenshot_retention_days: value }, t("retention.saved"));
  }

  const skipApps = selected?.screenshot_skip_apps ?? [];
  const hasSkipApp = (app: string) =>
    skipApps.some((value) => value.toLowerCase() === app.toLowerCase());

  const suggestedLower = useMemo(
    () =>
      new Set(
        privacyApps.flatMap((category) =>
          category.apps.map((app) => app.toLowerCase()),
        ),
      ),
    [privacyApps],
  );

  const customSkipApps = skipApps.filter(
    (app) => !suggestedLower.has(app.toLowerCase()),
  );

  function saveMode(mode: ScreenshotMode) {
    const patch: BusinessSettingsPatch = { screenshot_mode: mode };
    if (
      mode === "privacy" &&
      skipApps.length === 0 &&
      privacyApps.length > 0
    ) {
      patch.screenshot_skip_apps = privacyApps.flatMap(
        (category) => category.apps,
      );
    }
    savePatch(patch, t("screenshotMode.saved"));
  }

  function addSkipApps(apps: string[]) {
    const fresh = apps.filter((app) => !hasSkipApp(app));
    if (!fresh.length) return;
    savePatch(
      { screenshot_skip_apps: [...skipApps, ...fresh] },
      t("skipApps.saved"),
    );
  }

  function removeSkipApps(apps: string[]) {
    const drop = new Set(apps.map((app) => app.toLowerCase()));
    savePatch(
      {
        screenshot_skip_apps: skipApps.filter(
          (app) => !drop.has(app.toLowerCase()),
        ),
      },
      t("skipApps.saved"),
    );
  }

  function addSkipApp() {
    const name = skipAppInput.trim();
    if (!name) return;
    setSkipAppInput("");
    addSkipApps([name]);
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
    ["storage", t("v1.sections.storage")],
    ["audit", t("v1.sections.audit")],
    ["account", t("v1.sections.account")],
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
              <Card className="settings-card">
                <SettingsRow title={t("v1.organization.name")}>
                  <div className="settings-readonly">
                    <span className="settings-readonly__value">
                      {selected.name}
                    </span>
                  </div>
                </SettingsRow>
                <SettingsRow title={t("v1.organization.type")}>
                  <div className="settings-readonly">
                    <span className="settings-readonly__value">
                      {selected.kind === "family"
                        ? t("v1.organization.family")
                        : t("v1.organization.team")}
                    </span>
                  </div>
                </SettingsRow>
                <SettingsRow title={t("v1.organization.yourRole")}>
                  <div className="settings-readonly">
                    <span className="settings-readonly__value">
                      {t(`v1.roles.${selected.role}`)}
                    </span>
                  </div>
                </SettingsRow>
              </Card>
            </SettingsSection>

            <SettingsSection
              id="monitoring"
              title={t("v1.sections.monitoring")}
              description={t("v1.monitoring.description")}
            >
              <Card className="settings-card">
                <SettingsRow
                  title={t("capturePolicy.title")}
                  description={t("capturePolicy.desc", {
                    members: terms.many,
                  })}
                >
                  <Segmented
                    value={
                      selected.allow_employee_override ? "override" : "locked"
                    }
                    ariaLabel={t("capturePolicy.ariaLabel", {
                      member: terms.lowerOne,
                    })}
                    disabled={saving}
                    options={[
                      {
                        value: "locked",
                        label: t("capturePolicy.locked"),
                      },
                      {
                        value: "override",
                        label: t("capturePolicy.allowOverride"),
                      },
                    ]}
                    onChange={(value) =>
                      savePatch(
                        {
                          allow_employee_override: value === "override",
                        },
                        value === "override"
                          ? t("capturePolicy.savedAllowed", {
                              members: terms.many,
                            })
                          : t("capturePolicy.savedLocked", {
                              members: terms.many,
                            }),
                      )
                    }
                  />
                </SettingsRow>

                <SettingsRow
                  title={t("idleThreshold.title")}
                  description={t("idleThreshold.desc")}
                >
                  <Segmented
                    value={selected.idle_threshold_s}
                    ariaLabel={t("idleThreshold.ariaLabel")}
                    disabled={saving}
                    options={IDLE_PRESETS.map((preset) => ({
                      value: preset.value,
                      label: t("presets.min", {
                        count: preset.minutes,
                      }),
                    }))}
                    onChange={(value) =>
                      savePatch(
                        { idle_threshold_s: value },
                        t("idleThreshold.saved"),
                      )
                    }
                  />
                </SettingsRow>
              </Card>
            </SettingsSection>

            <SettingsSection
              id="screenshots"
              title={t("v1.sections.screenshots")}
              description={t("v1.screenshots.description")}
            >
              <Card className="settings-card">
                <SettingsRow
                  top
                  title={t("screenshotMode.title")}
                  description={t("screenshotMode.desc")}
                >
                  <div
                    className="settings-mode-grid"
                    role="radiogroup"
                    aria-label={t("screenshotMode.ariaLabel")}
                  >
                    <ModeOption
                      label={t("screenshotMode.privacy")}
                      description={t("screenshotMode.privacyDesc")}
                      selected={
                        normalizeMode(selected.screenshot_mode) === "privacy"
                      }
                      disabled={saving}
                      onSelect={() => saveMode("privacy")}
                    />
                    <ModeOption
                      label={t("screenshotMode.normal")}
                      description={t("screenshotMode.normalDesc")}
                      selected={
                        normalizeMode(selected.screenshot_mode) === "normal"
                      }
                      disabled={saving}
                      onSelect={() => saveMode("normal")}
                    />
                  </div>
                </SettingsRow>

                <SettingsRow
                  title={t("screenshotInterval.title")}
                  description={t("screenshotInterval.desc", {
                    member: terms.lowerOne,
                  })}
                >
                  <Segmented
                    value={selected.screenshot_interval_s}
                    ariaLabel={t("screenshotInterval.ariaLabel")}
                    disabled={saving}
                    options={INTERVAL_PRESETS.map((preset) => ({
                      value: preset.value,
                      label: t("presets.min", {
                        count: preset.minutes,
                      }),
                    }))}
                    onChange={(value) =>
                      savePatch(
                        { screenshot_interval_s: value },
                        t("screenshotInterval.saved"),
                      )
                    }
                  />
                </SettingsRow>

                {normalizeMode(selected.screenshot_mode) === "privacy" && (
                  <SettingsRow
                    title={t("skipApps.title")}
                    description={t("skipApps.desc")}
                  >
                    <div className="settings-inline">
                      <span className="settings-count">
                        {t("skipApps.count", {
                          count: skipApps.length,
                        })}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={saving}
                        onClick={() => setSkipOpen(true)}
                      >
                        {t("skipApps.manage")}
                      </Button>
                    </div>
                  </SettingsRow>
                )}
              </Card>
            </SettingsSection>

            <SettingsSection
              id="storage"
              title={t("v1.sections.storage")}
              description={t("v1.storage.description")}
            >
              <Card className="settings-card">
                <SettingsRow
                  title={t("retention.title")}
                  description={t("retention.desc", {
                    name: selected.name,
                  })}
                >
                  <Segmented
                    value={String(retention)}
                    ariaLabel={t("retention.ariaLabel")}
                    disabled={saving}
                    options={RETENTION_PRESETS.map((preset) => ({
                      value: String(preset.value),
                      label:
                        preset.days === null
                          ? t("presets.never")
                          : t("presets.days", {
                              count: preset.days,
                            }),
                    }))}
                    onChange={(value) =>
                      saveRetention(
                        value === "null" ? null : Number(value),
                      )
                    }
                  />
                </SettingsRow>

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

            <SettingsSection
              id="account"
              title={t("v1.sections.account")}
              description={t("v1.account.description")}
            >
              <Card className="settings-card">
                <SettingsRow title={t("account.email")}>
                  <div className="settings-readonly">
                    <span className="settings-readonly__value">
                      {user?.email || user?.username || "—"}
                    </span>
                  </div>
                </SettingsRow>
                <SettingsRow title={t("account.displayName")}>
                  <div className="settings-readonly">
                    <span className="settings-readonly__value">
                      {user?.display_name || user?.username || "—"}
                    </span>
                  </div>
                </SettingsRow>
              </Card>
            </SettingsSection>
          </div>
        </div>
      )}

      {skipOpen && selected && (
        <Dialog
          title={t("skipApps.modalTitle")}
          size="complex"
          onClose={() => !saving && setSkipOpen(false)}
          closeOnBackdrop={!saving}
          footer={
            <Button variant="primary" onClick={() => setSkipOpen(false)}>
              {t("skipApps.done")}
            </Button>
          }
        >
          <div className="settings-dialog-stack">
            <p className="settings-section__description">
              {t("skipApps.desc")}
            </p>

            <div className="settings-inline">
              <div className="settings-skip-input">
                <TextField
                  id="skip-app-input"
                  label={t("skipApps.custom")}
                  value={skipAppInput}
                  placeholder={t("skipApps.placeholder")}
                  disabled={saving}
                  autoFocus
                  onChange={(event) => setSkipAppInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addSkipApp();
                    }
                  }}
                />
              </div>
              <Button
                variant="secondary"
                disabled={saving || !skipAppInput.trim()}
                onClick={addSkipApp}
              >
                {t("skipApps.add")}
              </Button>
            </div>

            {customSkipApps.length > 0 && (
              <div>
                <div className="settings-row__title">
                  {t("skipApps.custom")}
                </div>
                <div className="settings-chip-group settings-chip-group--top">
                  {customSkipApps.map((app) => (
                    <button
                      key={app}
                      type="button"
                      className="settings-chip is-active"
                      disabled={saving}
                      onClick={() => removeSkipApps([app])}
                    >
                      {app} ×
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="settings-skip-list">
              {privacyApps.map((category) => {
                const added = category.apps.filter(hasSkipApp);
                return (
                  <div className="settings-skip-category" key={category.key}>
                    <div className="settings-skip-category__head">
                      <span className="settings-skip-category__name">
                        {t(`skipApps.cat${category.key}`)} ({added.length}/
                        {category.apps.length})
                      </span>
                      {added.length < category.apps.length && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={saving}
                          onClick={() => addSkipApps(category.apps)}
                        >
                          {t("skipApps.addAll")}
                        </Button>
                      )}
                      {added.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={saving}
                          onClick={() => removeSkipApps(category.apps)}
                        >
                          {t("skipApps.removeAll")}
                        </Button>
                      )}
                    </div>

                    <div className="settings-chip-group">
                      {category.apps.map((app) => {
                        const active = hasSkipApp(app);
                        return (
                          <button
                            key={app}
                            type="button"
                            role="checkbox"
                            aria-checked={active}
                            className={`settings-chip${
                              active ? " is-active" : ""
                            }`}
                            disabled={saving}
                            onClick={() =>
                              active
                                ? removeSkipApps([app])
                                : addSkipApps([app])
                            }
                          >
                            {active ? "✓ " : "+ "}
                            {app}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
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
