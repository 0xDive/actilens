import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useRuntime } from "../runtime";

function relativeTime(ts: number, t: TFunction<"desktop">) {
  if (!ts) return t("time.never");
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (seconds < 45) return t("time.justNow");
  if (seconds < 3600) return t("time.minutesAgo", { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return t("time.hoursAgo", { count: Math.floor(seconds / 3600) });
  return new Date(ts * 1000).toLocaleString();
}

function heroKey(state: NonNullable<ReturnType<typeof useRuntime>["state"]>) {
  if (state.device === "revoked") return "revoked";
  if (state.connection === "offline" && state.reason === "network_error") return "offline";
  if (state.device === "blocked") return "blocked";
  if (state.permission_attention > 0) return "permissions";
  if (state.connection === "offline") return "offline";
  if (state.sync === "error") return "syncError";
  if (state.agent === "paused") return "paused";
  if (state.agent === "idle") return "idle";
  return "healthy";
}

export function Home({
  onOpenPermissions,
  onOpenDevice,
}: {
  onOpenPermissions: () => void;
  onOpenDevice: () => void;
}) {
  const { t } = useTranslation("desktop");
  const { state, loading, error, refresh } = useRuntime();

  if (loading && !state) {
    return <div className="desktop-v2-loading">{t("common.loading")}</div>;
  }

  if (!state) {
    return (
      <div className="desktop-v2-empty">
        <strong>{t("home.unavailable")}</strong>
        <span>{error || t("home.unavailableBody")}</span>
        <button className="actilens-btn actilens-btn--secondary" onClick={() => void refresh()}>
          {t("actions.retry")}
        </button>
      </div>
    );
  }

  const key = heroKey(state);
  const tone = ["revoked", "blocked", "syncError"].includes(key)
    ? "danger"
    : ["permissions", "offline"].includes(key)
      ? "warning"
      : key === "paused"
        ? "neutral"
        : "success";

  return (
    <div className="desktop-v2-page">
      <section className={`desktop-status-hero is-${tone}`}>
        <div className="desktop-status-hero__signal" aria-hidden>
          <span />
        </div>
        <div className="desktop-status-hero__copy">
          <div className="desktop-status-hero__eyebrow">{t("home.status")}</div>
          <h2>{t(`home.hero.${key}.title`)}</h2>
          <p>{t(`home.hero.${key}.body`, { count: state.permission_attention })}</p>
        </div>
        <button className="desktop-v2-icon-button" onClick={() => void refresh()} title={t("actions.refresh")}>
          ↻
        </button>
      </section>

      <div className="desktop-v2-grid desktop-v2-grid--two">
        <section className="desktop-v2-card">
          <div className="desktop-v2-card__head">
            <div>
              <span className="desktop-v2-kicker">{t("home.connection")}</span>
              <h3>{t(`connection.${state.connection}`)}</h3>
            </div>
            <span className={`desktop-v2-dot is-${state.connection}`} />
          </div>
          <p>
            {state.local_only
              ? t("home.localConnection")
              : t("home.lastSync", { value: relativeTime(state.last_sync_ts, t) })}
          </p>
        </section>

        <section className="desktop-v2-card">
          <div className="desktop-v2-card__head">
            <div>
              <span className="desktop-v2-kicker">{t("home.sync")}</span>
              <h3>{t(`sync.${state.sync}`, { count: state.pending })}</h3>
            </div>
          </div>
          <p>
            {state.local_only
              ? t("home.localStored")
              : state.pending > 0
                ? t("home.pending", { count: state.pending })
                : t("home.noPending")}
          </p>
        </section>
      </div>

      {(state.permission_attention > 0 ||
        state.connection === "offline" ||
        state.sync === "error" ||
        state.device === "revoked" ||
        state.device === "blocked") && (
        <section className="desktop-v2-card desktop-v2-attention">
          <div>
            <span className="desktop-v2-kicker">{t("home.attention")}</span>
            <h3>
              {state.device === "revoked"
                ? t("attention.deviceRevoked")
                : state.connection === "offline" && state.reason === "network_error"
                  ? t("attention.offline")
                  : state.device === "blocked"
                    ? t("attention.deviceBlocked")
                    : state.permission_attention > 0
                      ? t("attention.permissions", { count: state.permission_attention })
                      : state.connection === "offline"
                        ? t("attention.offline")
                        : t("attention.sync")}
            </h3>
          </div>
          <button
            className="actilens-btn actilens-btn--secondary"
            onClick={state.permission_attention > 0 ? onOpenPermissions : onOpenDevice}
          >
            {state.permission_attention > 0
              ? t("actions.openPermissions")
              : t("actions.openDevice")}
          </button>
        </section>
      )}
    </div>
  );
}
