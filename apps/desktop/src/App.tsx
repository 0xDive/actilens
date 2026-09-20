import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { call as invoke } from "./api";
import { Sentry } from "./sentry";
import { track } from "./analytics";
import { dragWindow } from "./components/dragWindow";
import { Permissions } from "./screens/Permissions";
import { DesktopSettings } from "./screens/DesktopSettings";
import { Device } from "./screens/DeviceV2";
import { Home } from "./screens/HomeV2";
import { Login, type Session } from "./screens/Login";
import { Welcome } from "./screens/Welcome";
import { Onboarding } from "./screens/Onboarding";
import { RuntimeProvider, useRuntime } from "./runtime";
import type { AppSettings } from "./runtimeTypes";
import brandMark from "./assets/brand-mark.svg";
import "./desktop-v2.css";

type Screen = "Home" | "Device" | "Permissions" | "Settings";
const MAIN_NAV: Screen[] = ["Home", "Device", "Permissions"];

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const HomeIcon = () => (
  <svg {...svgProps} aria-hidden>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 10.5V20h13v-9.5" />
    <path d="M9 20v-6h6v6" />
  </svg>
);
const DeviceIcon = () => (
  <svg {...svgProps} aria-hidden>
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);
const ShieldIcon = () => (
  <svg {...svgProps} aria-hidden>
    <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
const GearIcon = () => (
  <svg {...svgProps} aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const UserIcon = () => (
  <svg {...svgProps} aria-hidden>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);
const HardDriveIcon = () => (
  <svg {...svgProps} aria-hidden>
    <path d="M10 16h.01M6 16h.01" />
    <path d="M2 12h20M6 4h12l4 8v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" />
  </svg>
);
const ExternalIcon = () => (
  <svg {...svgProps} aria-hidden>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
  </svg>
);

const NAV_ICON: Record<Screen, () => ReactElement> = {
  Home: HomeIcon,
  Device: DeviceIcon,
  Permissions: ShieldIcon,
  Settings: GearIcon,
};

function applyTheme(mode: string) {
  const root = document.documentElement;
  if (mode.toLowerCase() === "system") {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", dark ? "dark" : "light");
  } else {
    root.setAttribute("data-theme", mode.toLowerCase());
  }
}

function DesktopShell({
  settings,
  session,
  onChangeSettings,
  onSignOut,
  onSessionExpired,
  onReturnToLogin,
}: {
  settings: AppSettings;
  session: Session | null;
  onChangeSettings: (patch: Partial<AppSettings>) => void;
  onSignOut: () => void;
  onSessionExpired: () => void;
  onReturnToLogin: () => void;
}) {
  const { t } = useTranslation("desktop");
  const [screen, setScreen] = useState<Screen>("Home");
  const { state } = useRuntime();
  const screenRef = useRef(screen);
  screenRef.current = screen;

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const el = (event.target as HTMLElement | null)?.closest?.("button, .nav-item");
      if (!el) return;
      const label = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40);
      track("ui_click", { label, screen: screenRef.current });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const openWebDashboard = useCallback(async () => {
    try {
      const url = await invoke<string>("web_dashboard_url");
      await openUrl(url);
    } catch {
      // The agent remains usable even if the system browser cannot be opened.
    }
  }, []);

  useEffect(() => {
    const unlisten = listen("open-web-dashboard", () => void openWebDashboard());
    return () => {
      unlisten.then((dispose) => dispose());
    };
  }, [openWebDashboard]);

  useEffect(() => {
    if (session && state?.connection === "signed_out") {
      onSessionExpired();
    }
  }, [onSessionExpired, session, state?.connection]);

  const statusKey =
    state?.device === "revoked"
      ? "revoked"
      : state?.device === "blocked"
        ? "blocked"
        : state?.permission_attention
          ? "attention"
          : state?.connection === "offline"
            ? "offline"
            : state?.sync === "error"
              ? "attention"
              : state?.agent || "loading";

  return (
    <div className="app desktop-v2-shell">
      <div className="app-titlebar desktop-v2-titlebar" onMouseDown={dragWindow} />

      <div className="app-body">
        <aside className="sidebar desktop-v2-sidebar">
          <div className="brand desktop-v2-brand">
            <span className="brand-logo" aria-hidden>
              <img src={brandMark} alt="" />
            </span>
            <span className="brand-name">Acti<span className="brand-accent">Lens</span></span>
          </div>

          <nav className="nav desktop-v2-nav" aria-label={t("nav.home")}>
            {MAIN_NAV.map((item) => {
              const Icon = NAV_ICON[item];
              return (
                <button
                  key={item}
                  type="button"
                  className={`nav-item ${screen === item ? "active" : ""}`}
                  onClick={() => setScreen(item)}
                >
                  <span className="nav-ic"><Icon /></span>
                  {t(`nav.${item.toLowerCase()}`)}
                </button>
              );
            })}
          </nav>

          <div className="desktop-v2-sidebar-settings">
            <button
              type="button"
              className={`nav-item ${screen === "Settings" ? "active" : ""}`}
              onClick={() => setScreen("Settings")}
            >
              <span className="nav-ic"><GearIcon /></span>
              {t("nav.settings")}
            </button>
          </div>

          <div className="sidebar-foot desktop-v2-sidebar-foot">
            <div className={`desktop-v2-side-state is-${statusKey}`}>
              <span />
              {t(`runtime.${statusKey}`, { defaultValue: statusKey })}
            </div>

            {session ? (
              <div className="account-box desktop-v2-account">
                <div className="account-row">
                  <span className="account-ic"><UserIcon /></span>
                  <span className="account-text" title={session.email}>{session.email}</span>
                </div>
                {state?.business_name && (
                  <div className="desktop-v2-account-org" title={state.business_name}>
                    {state.business_name}
                  </div>
                )}
                <button className="account-link desktop-v2-web-link" onClick={() => void openWebDashboard()}>
                  <ExternalIcon /> {t("actions.manageWeb")}
                </button>
                <button className="account-link" onClick={onSignOut}>
                  {t("actions.signOut")}
                </button>
              </div>
            ) : (
              <div className="account-box desktop-v2-account">
                <div className="account-row">
                  <span className="account-ic"><HardDriveIcon /></span>
                  <span className="account-text">{t("connection.local")}</span>
                </div>
                <button className="account-link" onClick={onReturnToLogin}>
                  {t("actions.setupAgain")} <span aria-hidden>→</span>
                </button>
              </div>
            )}
          </div>
        </aside>

        <div className="main desktop-v2-main">
          <header className="header desktop-v2-header">
            <h1>{t(`nav.${screen.toLowerCase()}`)}</h1>
            <div className={`desktop-v2-runtime-pill is-${statusKey}`}>
              <span />
              {t(`runtime.${statusKey}`, { defaultValue: statusKey })}
            </div>
          </header>

          <main className="content desktop-v2-content">
            {screen === "Home" && (
              <Home
                onOpenPermissions={() => setScreen("Permissions")}
                onOpenDevice={() => setScreen("Device")}
              />
            )}
            {screen === "Device" && <Device />}
            {screen === "Permissions" && <Permissions />}
            {screen === "Settings" && (
              <DesktopSettings settings={settings} onChange={onChangeSettings} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    invoke<Session | null>("current_session")
      .then((value) => setSession(value ?? null))
      .catch(() => setSession(null));
    invoke<AppSettings>("get_settings")
      .then(setSettings)
      .catch(() => setSettings(null));
  }, []);

  useEffect(() => {
    const locale = i18n.resolvedLanguage ?? "en";
    invoke("set_locale", { locale }).catch(() => {});
  }, [i18n.resolvedLanguage]);

  useEffect(() => {
    if (session) {
      Sentry.setUser({ email: session.email, username: session.email });
    } else if (session === null) {
      Sentry.setUser(null);
    }
  }, [session]);

  const pastAuthGate = session != null || settings?.local_only === true;

  useEffect(() => {
    if (session === undefined || settings === null) return;
    if (!pastAuthGate && settings.onboarding_completed) {
      void updateSettings({ onboarding_completed: false });
    }
  }, [session, settings, pastAuthGate]);

  const inSetup = !pastAuthGate || settings?.onboarding_completed === false;
  useEffect(() => {
    if (session === undefined || settings === null) return;
    invoke("set_in_setup", { inSetup }).catch(() => {});
  }, [session === undefined, settings === null, inSetup]);

  // Native runtime owns organization policy. The UI may request a refresh when a
  // managed window is opened/refocused, but it never receives or interprets the
  // capture policy itself.
  const refreshNativePolicy = useCallback(() => {
    if (!session?.business_id) return;
    invoke("apply_org_policy").catch(() => {});
  }, [session?.business_id]);

  useEffect(() => {
    refreshNativePolicy();
  }, [refreshNativePolicy]);

  useEffect(() => {
    if (!session?.business_id) return;
    const onFocus = () => refreshNativePolicy();
    const onVisible = () => {
      if (!document.hidden) refreshNativePolicy();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshNativePolicy, session?.business_id]);

  const theme = settings?.theme ?? "System";
  useEffect(() => {
    applyTheme(theme);
    if (theme.toLowerCase() !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("System");
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);

  async function updateSettings(patch: Partial<AppSettings>) {
    if (!settings) return;
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await invoke("set_settings", { value: next });
    } catch {
      setSettings(previous);
    }
  }

  async function signOut() {
    try {
      await invoke("logout");
    } catch {
      // Clear the local UI session regardless; native state reconciles next launch.
    }
    setSession(null);
    setShowLogin(false);
  }

  function sessionExpired() {
    setSession(null);
    setShowLogin(true);
  }

  if (session === undefined || settings === null) {
    return (
      <div className="login">
        <div className="muted">{t("loading")}</div>
      </div>
    );
  }

  if (!pastAuthGate) {
    return showLogin ? (
      <Login onLoggedIn={setSession} onBack={() => setShowLogin(false)} />
    ) : (
      <Welcome
        onUseLocally={() => void updateSettings({ local_only: true })}
        onSignIn={() => setShowLogin(true)}
      />
    );
  }

  if (!settings.onboarding_completed) {
    return (
      <Onboarding
        settings={settings}
        managed={Boolean(session?.business_id)}
        onChange={(patch) => void updateSettings(patch)}
        onFinish={() =>
          void updateSettings({ onboarding_completed: true, consented: true })
        }
      />
    );
  }

  return (
    <RuntimeProvider>
      <DesktopShell
        settings={settings}
        session={session}
        onChangeSettings={(patch) => void updateSettings(patch)}
        onSignOut={() => void signOut()}
        onSessionExpired={sessionExpired}
        onReturnToLogin={() => {
          setShowLogin(true);
          void updateSettings({ local_only: false, onboarding_completed: false });
        }}
      />
    </RuntimeProvider>
  );
}

export default App;
