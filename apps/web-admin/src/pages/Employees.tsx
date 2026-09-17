import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  createBusiness,
  createEmployee,
  listBusinessEmployees,
  updateEmployee,
  resetEmployeePassword,
  archiveEmployee,
} from "../api/endpoints";
import { ApiError, type BusinessKind, type Employee } from "../api/types";
import { Empty, Modal, Notice, Spinner } from "../components/ui";
import { MemberRoleControl } from "../components/employee/MemberRoleControl";
import { useBusinesses } from "../useBusinesses";
import { memberTerms, type MemberTerms } from "../terms";
import { useAuth } from "../auth/AuthContext";
import { canManageMembers, canManageRoles } from "../rbac";

// ── display-only helpers (mirror the Dashboard roster look) ──────────
const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const IconPlus = svg(<><path d="M5 12h14" /><path d="M12 5v14" /></>);
const IconUserPlus = svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></>);
const IconArrowRight = svg(<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>);
const IconBuilding = svg(<><path d="M10 12h4" /><path d="M10 8h4" /><path d="M14 21v-3a2 2 0 0 0-4 0v3" /><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" /><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" /></>);
const IconClose = svg(<><path d="M18 6 6 18M6 6l12 12" /></>);
const IconHouse = svg(<><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>);
const IconDices = svg(<><rect width="12" height="12" x="2" y="10" rx="2" ry="2" /><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6" /><path d="M6 18h.01" /><path d="M10 14h.01" /><path d="M15 6h.01" /><path d="M18 9h.01" /></>);

/** Local strong temp-password generator (mirrors the wizard's). */
function genTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const AVATAR_PALETTE = [
  { bg: "var(--info-soft)", fg: "var(--info)" },
  { bg: "var(--positive-soft)", fg: "var(--positive)" },
  { bg: "color-mix(in srgb, var(--data-rose) 18%, transparent)", fg: "var(--data-rose)" },
  { bg: "color-mix(in srgb, var(--data-amber) 22%, transparent)", fg: "var(--data-amber)" },
];
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

function employeeStatus(e: Employee): "active" | "idle" | "offline" {
  if (!e.active || !e.last_seen) return "offline";
  const age = Math.max(0, Date.now() / 1000 - e.last_seen);
  if (age < 420) return "active";
  if (age < 1200) return "idle";
  return "offline";
}

export function Employees() {
  const { t } = useTranslation("dashboard");
  const { user } = useAuth();
  const {
    businesses,
    selected,
    selectedId,
    setSelectedId,
    loading: bizLoading,
    reload: reloadBiz,
  } = useBusinesses();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [showBiz, setShowBiz] = useState(false);
  const [showEmp, setShowEmp] = useState(false);
  const [autoCreatedNote, setAutoCreatedNote] = useState<string | null>(null);

  const terms = memberTerms(selected?.kind);
  const mayManageMembers = canManageMembers(selected?.role);
  const mayManageRoles = canManageRoles(selected?.role);

  function loadEmployees(id: string) {
    setLoading(true);
    setListError(null);
    listBusinessEmployees(id)
      .then((r) => setEmployees(r.employees))
      .catch(() => setListError(t("employees.errorLoadMembers", { members: terms.lowerMany })))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (selectedId) loadEmployees(selectedId);
    else setEmployees([]);
  }, [selectedId]);

  // Open the "new business" modal when arrived here via the topbar picker (?new=1).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === null) return;
    setShowBiz(true);
    searchParams.delete("new");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const hasBusiness = businesses.length > 0;

  async function editEmployeeAccount(e: Employee) {
    const displayName = window.prompt(t("employees.prompts.displayName"), e.display_name);
    if (displayName === null) return;
    const login = window.prompt(t("employees.prompts.login"), e.email || e.username || "");
    if (login === null) return;
    const v = login.trim();
    const patch = v.includes("@")
      ? { display_name: displayName.trim(), email: v, username: "" }
      : { display_name: displayName.trim(), username: v.toLowerCase(), email: "" };
    try {
      await updateEmployee(e.id, patch);
      if (selectedId) loadEmployees(selectedId);
    } catch { window.alert(t("employees.prompts.failed")); }
  }

  async function changeEmployeePassword(e: Employee) {
    const password = window.prompt(t("employees.prompts.password"));
    if (!password) return;
    if (password.length < 8) { window.alert(t("employees.prompts.password")); return; }
    try {
      await resetEmployeePassword(e.id, password);
      window.alert(t("employees.prompts.passwordSaved"));
    } catch { window.alert(t("employees.prompts.failed")); }
  }

  async function toggleEmployeeActive(e: Employee) {
    const ok = window.confirm(t(e.active ? "employees.prompts.confirmArchive" : "employees.prompts.confirmRestore"));
    if (!ok) return;
    try {
      if (e.active) await archiveEmployee(e.id);
      else await updateEmployee(e.id, { active: true });
      if (selectedId) loadEmployees(selectedId);
    } catch { window.alert(t("employees.prompts.failed")); }
  }

  return (
    <div className="ad-wrap" style={{ paddingBottom: 32 }}>
      <div className="ad-pagehead">
        <div className="ad-pagehead__main">
          <h1 className="ad-h1">{terms.many}</h1>
          {selected && (
            <p className="ad-sub">
              {selected.name} · {employees.length} {terms.many}
            </p>
          )}
        </div>
        <div className="ad-pagehead__actions">
          <button className="actilens-btn actilens-btn--secondary" onClick={() => setShowBiz(true)}>
            <span style={{ display: "inline-flex", lineHeight: 0 }}>{IconPlus}</span>
            <span>{t("employees.newOrg", { org: terms.org })}</span>
          </button>
          {mayManageMembers && (
            <button className="actilens-btn actilens-btn--primary" onClick={() => setShowEmp(true)}>
              <span style={{ display: "inline-flex", lineHeight: 0 }}>{IconUserPlus}</span>
              <span>{terms.addCta}</span>
            </button>
          )}
        </div>
      </div>

      {!hasBusiness && !bizLoading && (
        <div style={{ marginBottom: 16 }}>
          <Notice kind="info">
            <Trans
              i18nKey="employees.noBusinessNotice"
              t={t}
              values={{ member: terms.lowerOne }}
              components={{ 1: <em /> }}
            />
          </Notice>
        </div>
      )}

      {autoCreatedNote && (
        <div style={{ marginBottom: 16 }}>
          <Notice kind="success">{autoCreatedNote}</Notice>
        </div>
      )}

      {bizLoading && <Spinner label={t("employees.loading")} />}

      {listError && <Notice kind="danger">{listError}</Notice>}
      {loading && <Spinner label={t("employees.loadingMembers", { members: terms.lowerMany })} />}

      {!loading && selectedId && employees.length === 0 && !listError && (
        <Empty>{t("employees.noMembersYet", { members: terms.lowerMany })}</Empty>
      )}

      {employees.length > 0 && (
        <div className="actilens-card actilens-card--default ad-tablecard">
          <table className="ad-table ad-table--roster">
            <thead>
              <tr>
                <th>{t("employees.table.name")}</th>
                <th>{t("employees.table.login")}</th>
                <th>{t("employees.table.role")}</th>
                <th>{t("employees.table.currentApp")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e, i) => {
                const pal = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
                const isSelf = e.id === user?.id;
                const status = employeeStatus(e);
                const mayManageThis = mayManageMembers && !(selected?.role === "admin" && e.role === "admin");
                return (
                  <tr key={e.id}>
                    <td>
                      <div className="ad-name">
                        <span className="actilens-avatar" style={{ ["--_s" as string]: "34px" }}>
                          <span className="actilens-avatar__img" aria-label={e.display_name} style={{ background: pal.bg, color: pal.fg }}>
                            {initials(e.display_name)}
                          </span>
                          <span className={`actilens-avatar__dot actilens-avatar__dot--${status}`} />
                        </span>
                        <span className="ad-name__txt">
                          {e.display_name}
                          {isSelf && <span className="ad-self">{t("dashboard.selfBadge")}</span>}
                          {!e.active && <span className="ad-self">{t("employees.blocked")}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="ad-login">{e.email || e.username}</td>
                    <td>
                      <MemberRoleControl
                        employee={e}
                        businessId={selectedId!}
                        canChange={mayManageRoles}
                        onChanged={() => selectedId && loadEmployees(selectedId)}
                      />
                    </td>
                    <td className="ad-login">{status === "offline" ? "—" : (e.current_app || "—")}</td>
                    <td className="r">
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                        <Link className="ad-viewlink" to={`/employees/${e.id}?business=${selectedId}`}>
                          {t("employees.viewReports")}{IconArrowRight}
                        </Link>
                        {mayManageThis && (
                          <>
                            <button className="actilens-btn actilens-btn--ghost" onClick={() => editEmployeeAccount(e)}>{t("employees.actions.edit")}</button>
                            <button className="actilens-btn actilens-btn--ghost" onClick={() => changeEmployeePassword(e)}>{t("employees.actions.password")}</button>
                            <button className="actilens-btn actilens-btn--ghost" onClick={() => toggleEmployeeActive(e)}>
                              {t(e.active ? "employees.actions.archive" : "employees.actions.restore")}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showBiz && (
        <NewBusinessModal
          terms={terms}
          kind={selected?.kind}
          onClose={() => setShowBiz(false)}
          onCreated={async (id) => {
            setShowBiz(false);
            await reloadBiz();
            setSelectedId(id);
          }}
        />
      )}

      {showEmp && mayManageMembers && (
        <NewEmployeeModal
          businessId={selectedId}
          terms={terms}
          onClose={() => setShowEmp(false)}
          onCreated={async (newBusinessId, wasAutoCreated) => {
            setShowEmp(false);
            if (wasAutoCreated) {
              await reloadBiz();
              setSelectedId(newBusinessId);
              setAutoCreatedNote(
                t("employees.autoCreatedNote", { member: terms.lowerOne }),
              );
            } else if (selectedId) {
              loadEmployees(selectedId);
            }
          }}
        />
      )}
    </div>
  );
}

function NewBusinessModal({
  terms,
  kind,
  onClose,
  onCreated,
}: {
  terms: MemberTerms;
  kind: BusinessKind | undefined;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation("dashboard");
  const isFamily = kind === "family";
  const orgCap = terms.org.charAt(0).toUpperCase() + terms.org.slice(1);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const biz = await createBusiness(name.trim());
      onCreated(biz.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("newBusinessModal.errorCreate"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal wide onClose={onClose}>
      <div className="actilens-dlg actilens-dlg--org" role="dialog" aria-modal="true">
        <div className="actilens-dlg__head">
          <div className="actilens-dlg__icon">
            <span style={{ display: "inline-flex", lineHeight: 0 }}>{isFamily ? IconHouse : IconBuilding}</span>
          </div>
          <div className="actilens-dlg__title">{t("employees.newOrg", { org: terms.org })}</div>
          <button
            type="button"
            className="actilens-dlg__close"
            aria-label={t("newBusinessModal.cancel")}
            onClick={onClose}
          >
            {IconClose}
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="actilens-dlg__body">
            {error && (
              <div style={{ marginBottom: 12 }}>
                <Notice kind="danger">{error}</Notice>
              </div>
            )}
            <label className="actilens-field">
              <span className="actilens-field__lbl">{t("newBusinessModal.orgNameLabel", { org: orgCap })}</span>
              <span className="actilens-input">
                <input
                  placeholder={t(isFamily ? "newBusinessModal.namePlaceholderFamily" : "newBusinessModal.namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </span>
            </label>
          </div>
          <div className="actilens-dlg__foot">
            <button type="button" className="actilens-btn actilens-btn--ghost" onClick={onClose}>
              {t("newBusinessModal.cancel")}
            </button>
            <button className="actilens-btn actilens-btn--primary" disabled={busy || !name.trim()}>
              {busy ? t("newBusinessModal.creating") : t("newBusinessModal.create")}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

function NewEmployeeModal({
  businessId,
  terms,
  onClose,
  onCreated,
}: {
  businessId: string | null;
  terms: MemberTerms;
  onClose: () => void;
  onCreated: (businessId: string, wasAutoCreated: boolean) => void;
}) {
  const { t } = useTranslation("dashboard");
  const [login, setLogin] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ login?: string; password?: string }>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const value = login.trim();
    const isEmail = value.includes("@");
    try {
      const res = await createEmployee({
        email: isEmail ? value : undefined,
        username: isEmail ? undefined : value.toLowerCase(),
        display_name: displayName.trim(),
        password,
        // Omit business_id when none is selected: backend auto-creates one.
        business_id: businessId ?? undefined,
      });
      onCreated(res.business.id, businessId === null);
    } catch (err) {
      if (err instanceof ApiError) {
        // Map well-known validation cases inline; otherwise show a banner.
        if (err.status === 409) {
          setFieldErrors({ login: t("newEmployeeModal.errorTaken") });
        } else if (/password/i.test(err.message)) {
          setFieldErrors({ password: err.message });
        } else if (/username/i.test(err.message)) {
          setFieldErrors({ login: err.message });
        } else {
          setError(err.message);
        }
      } else {
        setError(t("newEmployeeModal.errorCreate", { member: terms.lowerOne }));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal wide onClose={onClose}>
      <div className="actilens-dlg" role="dialog" aria-modal="true" style={{ ["--_w" as string]: "460px" }}>
        <div className="actilens-dlg__head">
          <div className="actilens-dlg__icon">
            <span style={{ display: "inline-flex", lineHeight: 0 }}>{IconUserPlus}</span>
          </div>
          <div className="actilens-dlg__title">{terms.addCta}</div>
          <button
            type="button"
            className="actilens-dlg__close"
            aria-label={t("newEmployeeModal.cancel")}
            onClick={onClose}
          >
            {IconClose}
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="actilens-dlg__body">
            {!businessId && (
              <div style={{ marginBottom: 12 }}>
                <Notice kind="info">
                  {t("newEmployeeModal.noBusinessSelected", { member: terms.lowerOne })}
                </Notice>
              </div>
            )}
            {error && (
              <div style={{ marginBottom: 12 }}>
                <Notice kind="danger">{error}</Notice>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label className="actilens-field">
                <span className="actilens-field__lbl">{t("newEmployeeModal.displayName")}</span>
                <span className="actilens-input">
                  <input
                    placeholder="Mia"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    autoFocus
                  />
                </span>
              </label>
              <label className="actilens-field">
                <span className="actilens-field__lbl">{t("newEmployeeModal.usernameOrEmail")}</span>
                <span className="actilens-input">
                  <input
                    type="text"
                    placeholder="mia_home"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </span>
                {fieldErrors.login && <div className="error-text">{fieldErrors.login}</div>}
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 0%" }}>
                  <label className="actilens-field">
                    <span className="actilens-field__lbl">{t("newEmployeeModal.temporaryPassword")}</span>
                    <span className="actilens-input actilens-input--dots">
                      <input
                        type="text"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </span>
                    {fieldErrors.password && <div className="error-text">{fieldErrors.password}</div>}
                  </label>
                </div>
                <button
                  type="button"
                  className="actilens-btn actilens-btn--secondary"
                  title={t("newEmployeeModal.generate")}
                  onClick={() => setPassword(genTempPassword())}
                >
                  <span style={{ display: "inline-flex", lineHeight: 0 }}>{IconDices}</span>
                  <span>{t("newEmployeeModal.generate")}</span>
                </button>
              </div>
            </div>
          </div>
          <div className="actilens-dlg__foot">
            <button type="button" className="actilens-btn actilens-btn--ghost" onClick={onClose}>
              {t("newEmployeeModal.cancel")}
            </button>
            <button
              className="actilens-btn actilens-btn--primary"
              disabled={busy || !displayName.trim() || !login.trim() || !password}
            >
              {busy ? t("newEmployeeModal.adding") : terms.addCta}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
