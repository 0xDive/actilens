import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createEnrollmentToken, type EnrollmentTokenResponse } from "../../api/enrollment";
import type { Employee } from "../../api/types";
import { Modal, Notice } from "../ui";

function psQuote(value: string) {
  return value.replace(/'/g, "''");
}

async function copyText(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  // Clipboard API is normally unavailable on LAN HTTP origins. Keep the admin
  // flow usable before HTTPS is configured by falling back to the legacy copy path.
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, value.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy failed");
}

export function EnrollmentTokenControl({ employee, businessId, canChange }: {
  employee: Employee;
  businessId: string;
  canChange: boolean;
}) {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState(24);
  const [grant, setGrant] = useState<EnrollmentTokenResponse | null>(null);
  const [copied, setCopied] = useState<"token" | "powershell" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const backendUrl = typeof window === "undefined" ? "" : window.location.origin;
  const powershell = useMemo(() => {
    if (!grant) return "";
    return [
      `$env:ACTILENS_BACKEND_URL='${psQuote(backendUrl)}'`,
      `$env:ACTILENS_ENROLL_TOKEN='${psQuote(grant.token)}'`,
      `[Environment]::SetEnvironmentVariable('ACTILENS_BACKEND_URL',$env:ACTILENS_BACKEND_URL,'User')`,
      `[Environment]::SetEnvironmentVariable('ACTILENS_ENROLL_TOKEN',$env:ACTILENS_ENROLL_TOKEN,'User')`,
    ].join("; ");
  }, [grant, backendUrl]);

  if (!canChange || !employee.active) return null;

  async function generate() {
    setBusy(true);
    setError(null);
    setCopied(null);
    try {
      setGrant(await createEnrollmentToken(businessId, employee.id, hours));
    } catch {
      setError(t("employees.enrollment.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function copy(kind: "token" | "powershell", value: string) {
    try {
      await copyText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setError(t("employees.enrollment.copyFailed"));
    }
  }

  return (
    <>
      <button
        type="button"
        className="actilens-btn actilens-btn--ghost"
        onClick={() => {
          setOpen(true);
          setGrant(null);
          setError(null);
          setCopied(null);
        }}
      >
        {t("employees.actions.enrollment")}
      </button>

      {open && (
        <Modal title={t("employees.enrollment.title", { name: employee.display_name })} onClose={() => setOpen(false)}>
          <div style={{ display: "grid", gap: 14, minWidth: 520, maxWidth: 680 }}>
            <Notice kind="info">{t("employees.enrollment.description")}</Notice>

            {!grant && (
              <>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t("employees.enrollment.expires")}</span>
                  <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                    <option value={1}>{t("employees.enrollment.ttl1")}</option>
                    <option value={24}>{t("employees.enrollment.ttl24")}</option>
                    <option value={72}>{t("employees.enrollment.ttl72")}</option>
                    <option value={168}>{t("employees.enrollment.ttl168")}</option>
                  </select>
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button className="actilens-btn actilens-btn--secondary" onClick={() => setOpen(false)}>
                    {t("employees.enrollment.cancel")}
                  </button>
                  <button className="actilens-btn actilens-btn--primary" disabled={busy} onClick={generate}>
                    {busy ? t("employees.enrollment.generating") : t("employees.enrollment.generate")}
                  </button>
                </div>
              </>
            )}

            {grant && (
              <>
                <Notice kind="success">{t("employees.enrollment.created", { expires: new Date(grant.expires_at).toLocaleString() })}</Notice>

                <div style={{ display: "grid", gap: 6 }}>
                  <strong style={{ fontSize: 13 }}>{t("employees.enrollment.tokenLabel")}</strong>
                  <code style={{ padding: 10, borderRadius: 8, background: "var(--surface-subtle)", overflowWrap: "anywhere", userSelect: "all" }}>
                    {grant.token}
                  </code>
                  <button className="actilens-btn actilens-btn--secondary" onClick={() => copy("token", grant.token)}>
                    {copied === "token" ? t("employees.enrollment.copied") : t("employees.enrollment.copyToken")}
                  </button>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <strong style={{ fontSize: 13 }}>{t("employees.enrollment.powershellLabel")}</strong>
                  <code style={{ padding: 10, borderRadius: 8, background: "var(--surface-subtle)", overflowWrap: "anywhere", userSelect: "all" }}>
                    {powershell}
                  </code>
                  <button className="actilens-btn actilens-btn--secondary" onClick={() => copy("powershell", powershell)}>
                    {copied === "powershell" ? t("employees.enrollment.copied") : t("employees.enrollment.copyPowershell")}
                  </button>
                </div>

                <div style={{ fontSize: 12, opacity: 0.75 }}>{t("employees.enrollment.oneTime")}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button className="actilens-btn actilens-btn--secondary" onClick={() => setGrant(null)}>
                    {t("employees.enrollment.regenerate")}
                  </button>
                  <button className="actilens-btn actilens-btn--primary" onClick={() => setOpen(false)}>
                    {t("employees.enrollment.done")}
                  </button>
                </div>
              </>
            )}

            {error && <Notice kind="danger">{error}</Notice>}
          </div>
        </Modal>
      )}
    </>
  );
}
