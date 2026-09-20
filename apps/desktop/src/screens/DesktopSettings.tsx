import { useTranslation } from "react-i18next";
import { Segmented } from "../ui";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { useRuntime } from "../runtime";
import type { AppSettings } from "../runtimeTypes";

export function DesktopSettings({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  const { t } = useTranslation("desktop");
  const { state } = useRuntime();

  return (
    <div className="desktop-v2-page">
      <section className="desktop-v2-card desktop-settings-card">
        <span className="desktop-v2-kicker">{t("settings.appearance")}</span>
        <div className="desktop-setting-row">
          <div>
            <strong>{t("settings.theme")}</strong>
            <span>{t("settings.themeBody")}</span>
          </div>
          <Segmented
            options={["Light", "Dark", "System"]}
            value={settings.theme}
            labels={{
              Light: t("theme.light"),
              Dark: t("theme.dark"),
              System: t("theme.system"),
            }}
            onChange={(theme) => onChange({ theme })}
          />
        </div>
        <div className="desktop-setting-row">
          <div>
            <strong>{t("settings.language")}</strong>
            <span>{t("settings.languageBody")}</span>
          </div>
          <LanguageSwitcher compact />
        </div>
      </section>

      <section className="desktop-v2-card desktop-settings-card">
        <span className="desktop-v2-kicker">{t("settings.behavior")}</span>
        {state?.autostart_supported && (
          <div className="desktop-setting-row">
            <div>
              <strong>{t("settings.startAtLogin")}</strong>
              <span>{t("settings.startAtLoginBody")}</span>
            </div>
            <button
              type="button"
              className={`desktop-v2-switch ${settings.start_at_login ? "is-on" : ""}`}
              role="switch"
              aria-checked={settings.start_at_login}
              onClick={() => onChange({ start_at_login: !settings.start_at_login })}
            >
              <span />
            </button>
          </div>
        )}
        <div className="desktop-setting-row">
          <div>
            <strong>{t("settings.background")}</strong>
            <span>{t("settings.backgroundBody")}</span>
          </div>
          <span className="actilens-badge actilens-badge--positive">{t("settings.alwaysOn")}</span>
        </div>
        <div className="desktop-setting-row">
          <div>
            <strong>{t("settings.hideDock")}</strong>
            <span>{t("settings.hideDockBody")}</span>
          </div>
          <button
            type="button"
            className={`desktop-v2-switch ${settings.hide_dock ? "is-on" : ""}`}
            role="switch"
            aria-checked={settings.hide_dock}
            onClick={() => onChange({ hide_dock: !settings.hide_dock })}
          >
            <span />
          </button>
        </div>
      </section>

      <section className="desktop-v2-card desktop-settings-card">
        <span className="desktop-v2-kicker">{t("settings.updates")}</span>
        <div className="desktop-setting-row">
          <div>
            <strong>{t("settings.currentVersion", { version: state?.app_version || "—" })}</strong>
            <span>
              {state?.managed ? t("settings.managedUpdates") : t("settings.manualUpdates")}
            </span>
          </div>
          <span className="actilens-badge actilens-badge--neutral">
            {state?.managed ? t("settings.managed") : t("settings.manual")}
          </span>
        </div>
      </section>

      <section className="desktop-v2-card desktop-settings-card">
        <span className="desktop-v2-kicker">{t("settings.about")}</span>
        <div className="desktop-setting-row">
          <div>
            <strong>ActiLens</strong>
            <span>{t("settings.aboutBody")}</span>
          </div>
          <code className="desktop-v2-version">{state?.app_version ? `v${state.app_version}` : "—"}</code>
        </div>
      </section>
    </div>
  );
}
