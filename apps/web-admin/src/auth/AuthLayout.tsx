import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LOCALES } from "../i18n";
import { useTheme, type ThemeMode } from "../theme/ThemeProvider";
import "../theme/auth-v1.css";

function BrandMark() {
  return (
    <span className="auth-v1__brand-mark" aria-hidden>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12h4l2-5 4 10 2-5h6" />
      </svg>
    </span>
  );
}

export function AuthLayout({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { mode, setMode } = useTheme();
  const locale =
    LOCALES.find((item) => item.code === i18n.resolvedLanguage)?.code ?? "en";

  return (
    <div className="auth-v1">
      <div className="auth-v1__top">
        <select
          className="auth-v1__control"
          aria-label={t("language")}
          value={locale}
          onChange={(event) => i18n.changeLanguage(event.currentTarget.value)}
        >
          {LOCALES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>

        <select
          className="auth-v1__control"
          aria-label={t("theme.auto")}
          value={mode}
          onChange={(event) => setMode(event.currentTarget.value as ThemeMode)}
        >
          <option value="light">{t("theme.light")}</option>
          <option value="dark">{t("theme.dark")}</option>
          <option value="system">{t("theme.auto")}</option>
        </select>
      </div>

      <main className="auth-v1__stage">
        <div
          className={
            wide ? "auth-v1__surface auth-v1__surface--wide" : "auth-v1__surface"
          }
        >
          <div className="auth-v1__brand">
            <BrandMark />
            <span className="auth-v1__brand-name">ActiLens</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
