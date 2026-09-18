import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  archiveEmployee,
  createBusiness,
  createEmployee,
  listBusinessEmployees,
  resetEmployeePassword,
  updateEmployee,
} from "../api/endpoints";
import { ApiError, type BusinessKind, type Employee } from "../api/types";
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  IconButton,
  PageHeader,
  Skeleton,
  TextField,
} from "../components/ds";
import { useToast } from "../components/ToastProvider";
import { MemberRoleControl } from "../components/employee/MemberRoleControl";
import { MemberMonitoringControl } from "../components/employee/MemberMonitoringControl";
import { EnrollmentTokenControl } from "../components/employee/EnrollmentTokenControl";
import { PermanentDeleteControl } from "../components/employee/PermanentDeleteControl";
import { useBusinesses } from "../useBusinesses";
import { memberTerms, type MemberTerms } from "../terms";
import { canManageMembers, canManageRoles } from "../rbac";
import "../theme/employees.css";

function Icon({
  children,
  size = 16,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Icon>
);

const MoreIcon = () => (
  <Icon size={18}>
    <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
  </Icon>
);

const DiceIcon = () => (
  <Icon>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="16" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </Icon>
);

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "?";
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

type Presence = "active" | "idle" | "offline" | "blocked";

function presence(employee: Employee): Presence {
  if (!employee.active) return "blocked";
  if (!employee.last_seen) return "offline";
  const age = Math.max(0, Date.now() / 1000 - employee.last_seen);
  if (age < 420) return "active";
  if (age < 1200) return "idle";
  return "offline";
}

function genTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return ref;
}

function EmployeesSkeleton() {
  return (
    <div className="employees-loading-card" aria-hidden>
      {Array.from({ length: 4 }, (_, index) => (
        <div className="employees-loading-row" key={index}>
          <Skeleton width="72%" height={16} />
          <Skeleton width="68%" height={14} />
          <Skeleton width={92} height={26} />
          <Skeleton width={112} height={24} />
          <Skeleton width="70%" height={14} />
          <Skeleton width={86} height={14} />
          <Skeleton width={30} height={30} />
        </div>
      ))}
    </div>
  );
}

function EmployeeActionsMenu({
  employee,
  businessId,
  canManage,
  canDelete,
  onChanged,
}: {
  employee: Employee;
  businessId: string;
  canManage: boolean;
  canDelete: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editName, setEditName] = useState(employee.display_name);
  const [editLogin, setEditLogin] = useState(employee.email || employee.username || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const ref = useDismiss(open, () => setOpen(false));

  async function saveEdit() {
    const name = editName.trim();
    const login = editLogin.trim();
    if (!name || !login) return;

    setBusy(true);
    setDialogError(null);
    try {
      const patch = login.includes("@")
        ? { display_name: name, email: login, username: "" }
        : { display_name: name, username: login.toLowerCase(), email: "" };
      await updateEmployee(employee.id, patch);
      setEditOpen(false);
      setOpen(false);
      onChanged();
      pushToast({ title: t("employees.prompts.saved"), tone: "success" });
    } catch {
      setDialogError(t("employees.prompts.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    if (password.length < 8) return;
    setBusy(true);
    setDialogError(null);
    try {
      await resetEmployeePassword(employee.id, password);
      setPasswordOpen(false);
      setOpen(false);
      setPassword("");
      pushToast({ title: t("employees.prompts.passwordSaved"), tone: "success" });
    } catch {
      setDialogError(t("employees.prompts.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    setBusy(true);
    setDialogError(null);
    try {
      if (employee.active) await archiveEmployee(employee.id);
      else await updateEmployee(employee.id, { active: true });
      setStatusOpen(false);
      setOpen(false);
      onChanged();
      pushToast({ title: t("employees.prompts.saved"), tone: "success" });
    } catch {
      setDialogError(t("employees.prompts.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="employees-actions" ref={ref}>
      <IconButton
        label={t("employees.actions.more")}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <MoreIcon />
      </IconButton>

      {open && (
        <div className="ds-shell-popover employees-actions__menu" role="menu">
          <Link
            className="ds-menu__item"
            to={`/employees/${employee.id}?business=${businessId}`}
            onClick={() => setOpen(false)}
          >
            {t("employees.actions.openProfile")}
          </Link>

          {canManage && (
            <>
              <EnrollmentTokenControl
                employee={employee}
                businessId={businessId}
                canChange={canManage}
                triggerVariant="menu-item"
                onDialogClose={() => setOpen(false)}
              />
              <button
                type="button"
                className="ds-menu__item"
                onClick={() => {
                  setEditName(employee.display_name);
                  setEditLogin(employee.email || employee.username || "");
                  setOpen(false);
                  setDialogError(null);
                  setEditOpen(true);
                }}
              >
                {t("employees.actions.edit")}
              </button>
              <button
                type="button"
                className="ds-menu__item"
                onClick={() => {
                  setOpen(false);
                  setPassword("");
                  setDialogError(null);
                  setPasswordOpen(true);
                }}
              >
                {t("employees.actions.password")}
              </button>
              <button
                type="button"
                className="ds-menu__item"
                onClick={() => {
                  setOpen(false);
                  setDialogError(null);
                  setStatusOpen(true);
                }}
              >
                {t(employee.active ? "employees.actions.archive" : "employees.actions.restore")}
              </button>
            </>
          )}

          {canDelete && (
            <>
              <div className="ds-menu__separator" />
              <PermanentDeleteControl
                employee={employee}
                businessId={businessId}
                canDelete={canDelete}
                onDeleted={onChanged}
                triggerVariant="menu-item"
                onDialogClose={() => setOpen(false)}
              />
            </>
          )}
        </div>
      )}

      {editOpen && (
        <Dialog
          title={t("employees.actions.edit")}
          onClose={() => !busy && setEditOpen(false)}
          closeOnBackdrop={!busy}
          footer={
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setEditOpen(false)}>
                {t("newBusinessModal.cancel")}
              </Button>
              <Button variant="primary" loading={busy} onClick={saveEdit}>
                {t("common:actions.save")}
              </Button>
            </>
          }
        >
          <div className="employees-form">
            <TextField
              id={`edit-name-${employee.id}`}
              label={t("employees.prompts.displayName")}
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              disabled={busy}
            />
            <TextField
              id={`edit-login-${employee.id}`}
              label={t("employees.prompts.login")}
              value={editLogin}
              onChange={(event) => setEditLogin(event.target.value)}
              disabled={busy}
              autoCapitalize="none"
              spellCheck={false}
            />
            {dialogError && <Alert tone="danger">{dialogError}</Alert>}
          </div>
        </Dialog>
      )}

      {passwordOpen && (
        <Dialog
          title={t("employees.actions.password")}
          onClose={() => !busy && setPasswordOpen(false)}
          closeOnBackdrop={!busy}
          footer={
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setPasswordOpen(false)}>
                {t("newBusinessModal.cancel")}
              </Button>
              <Button
                variant="primary"
                loading={busy}
                disabled={password.length < 8}
                onClick={savePassword}
              >
                {t("common:actions.save")}
              </Button>
            </>
          }
        >
          <div className="employees-form">
            <TextField
              id={`password-${employee.id}`}
              label={t("employees.prompts.password")}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
              autoComplete="new-password"
            />
            {dialogError && <Alert tone="danger">{dialogError}</Alert>}
          </div>
        </Dialog>
      )}

      {statusOpen && (
        <Dialog
          title={t(employee.active ? "employees.actions.archive" : "employees.actions.restore")}
          size="confirm"
          onClose={() => !busy && setStatusOpen(false)}
          closeOnBackdrop={!busy}
          footer={
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setStatusOpen(false)}>
                {t("newBusinessModal.cancel")}
              </Button>
              <Button
                variant={employee.active ? "danger" : "primary"}
                loading={busy}
                onClick={toggleActive}
              >
                {t(employee.active ? "employees.actions.archive" : "employees.actions.restore")}
              </Button>
            </>
          }
        >
          <p className="employees-dialog-note">
            {t(employee.active ? "employees.prompts.confirmArchive" : "employees.prompts.confirmRestore")}
          </p>
          {dialogError && <Alert tone="danger">{dialogError}</Alert>}
        </Dialog>
      )}
    </div>
  );
}

function NewBusinessDialog({
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
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFamily = kind === "family";
  const orgCap = terms.org.charAt(0).toUpperCase() + terms.org.slice(1);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const business = await createBusiness(name.trim());
      onCreated(business.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("newBusinessModal.errorCreate"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={t("employees.newOrg", { org: terms.org })}
      onClose={() => !busy && onClose()}
      closeOnBackdrop={!busy}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {t("newBusinessModal.cancel")}
          </Button>
          <Button
            type="submit"
            form="new-business-form"
            variant="primary"
            loading={busy}
            disabled={!name.trim()}
          >
            {t("newBusinessModal.create")}
          </Button>
        </>
      }
    >
      <form id="new-business-form" className="employees-form" onSubmit={submit}>
        {error && <Alert tone="danger">{error}</Alert>}
        <TextField
          id="new-business-name"
          label={t("newBusinessModal.orgNameLabel", { org: orgCap })}
          placeholder={t(
            isFamily
              ? "newBusinessModal.namePlaceholderFamily"
              : "newBusinessModal.namePlaceholder",
          )}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
          autoFocus
        />
      </form>
    </Dialog>
  );
}

function NewEmployeeDialog({
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const value = login.trim();
    const isEmail = value.includes("@");

    try {
      const result = await createEmployee({
        email: isEmail ? value : undefined,
        username: isEmail ? undefined : value.toLowerCase(),
        display_name: displayName.trim(),
        password,
        business_id: businessId ?? undefined,
      });
      onCreated(result.business.id, businessId === null);
    } catch (err) {
      if (err instanceof ApiError) {
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
    <Dialog
      title={terms.addCta}
      onClose={() => !busy && onClose()}
      closeOnBackdrop={!busy}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {t("newEmployeeModal.cancel")}
          </Button>
          <Button
            type="submit"
            form="new-employee-form"
            variant="primary"
            loading={busy}
            disabled={!displayName.trim() || !login.trim() || password.length < 8}
          >
            {terms.addCta}
          </Button>
        </>
      }
    >
      <form id="new-employee-form" className="employees-form" onSubmit={submit}>
        {!businessId && (
          <Alert tone="info">
            {t("newEmployeeModal.noBusinessSelected", { member: terms.lowerOne })}
          </Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}

        <TextField
          id="new-employee-name"
          label={t("newEmployeeModal.displayName")}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          disabled={busy}
          autoFocus
        />

        <TextField
          id="new-employee-login"
          label={t("newEmployeeModal.usernameOrEmail")}
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          disabled={busy}
          error={fieldErrors.login}
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
        />

        <div className="employees-password-row">
          <TextField
            id="new-employee-password"
            label={t("newEmployeeModal.temporaryPassword")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
            error={fieldErrors.password}
            autoComplete="new-password"
          />
          <Button
            variant="secondary"
            leadingIcon={<DiceIcon />}
            disabled={busy}
            onClick={() => setPassword(genTempPassword())}
          >
            {t("newEmployeeModal.generate")}
          </Button>
        </div>

        <p className="employees-dialog-note">
          {t("newEmployeeModal.shareCredentials", { member: terms.lowerOne })}
        </p>
      </form>
    </Dialog>
  );
}

export function Employees() {
  const { t } = useTranslation("dashboard");
  const { t: tCommon } = useTranslation("common");
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const {
    businesses,
    selected,
    selectedId,
    setSelectedId,
    loading: businessLoading,
    reload: reloadBusinesses,
  } = useBusinesses();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [showBusiness, setShowBusiness] = useState(false);
  const [showEmployee, setShowEmployee] = useState(false);

  const terms = memberTerms(selected?.kind);
  const mayManageMembers = canManageMembers(selected?.role);
  const mayManageRoles = canManageRoles(selected?.role);

  function loadEmployees(id: string) {
    setLoading(true);
    setListError(null);
    listBusinessEmployees(id)
      .then((result) => setEmployees(result.employees))
      .catch(() =>
        setListError(t("employees.errorLoadMembers", { members: terms.lowerMany })),
      )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (selectedId) loadEmployees(selectedId);
    else setEmployees([]);
  }, [selectedId]);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === null) return;
    setShowBusiness(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  function relativeTime(timestamp?: number | null): string {
    if (!timestamp) return t("employees.status.never");
    const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
    if (seconds < 60) return tCommon("time.justNow");
    if (seconds < 3600) return tCommon("time.minutesAgo", { count: Math.floor(seconds / 60) });
    if (seconds < 86400) return tCommon("time.hoursAgo", { count: Math.floor(seconds / 3600) });
    return tCommon("time.daysAgo", { count: Math.floor(seconds / 86400) });
  }

  return (
    <div className="employees-page">
      <PageHeader
        title={terms.many}
        subtitle={
          selected
            ? `${selected.name} · ${t("employees.total", { count: employees.length })}`
            : undefined
        }
        actions={
          mayManageMembers ? (
            <Button
              variant="primary"
              leadingIcon={<PlusIcon />}
              onClick={() => setShowEmployee(true)}
            >
              {terms.addCta}
            </Button>
          ) : undefined
        }
      />

      {!businessLoading && businesses.length === 0 && (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="info">
            <Trans
              t={t}
              i18nKey="employees.noBusinessNotice"
              values={{ member: terms.lowerOne }}
              components={{ 1: <em /> }}
            />
          </Alert>
        </div>
      )}

      {listError && (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="danger">{listError}</Alert>
        </div>
      )}

      {(businessLoading || loading) && <EmployeesSkeleton />}

      {!businessLoading && !loading && selectedId && employees.length === 0 && !listError && (
        <EmptyState
          title={t("employees.noMembersYet", { members: terms.lowerMany })}
          action={
            mayManageMembers ? (
              <Button variant="primary" onClick={() => setShowEmployee(true)}>
                {terms.addCta}
              </Button>
            ) : undefined
          }
        />
      )}

      {!loading && employees.length > 0 && selectedId && (
        <div className="ds-table-wrap employees-table-wrap">
          <table className="ds-table employees-table">
            <thead>
              <tr>
                <th>{t("employees.table.name")}</th>
                <th>{t("employees.table.login")}</th>
                <th>{t("employees.table.role")}</th>
                <th>{t("employees.table.monitoring")}</th>
                <th>{t("employees.table.currentApp")}</th>
                <th>{t("employees.table.lastSeen")}</th>
                <th aria-label={t("employees.actions.more")} />
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const state = presence(employee);
                const isPeerAdmin =
                  selected?.role === "admin" && employee.role === "admin";
                const mayManageThis = mayManageMembers && !isPeerAdmin;
                const statusLabel = t(`employees.status.${state}`);
                const showCurrentApp =
                  (state === "active" || state === "idle") && employee.current_app;

                return (
                  <tr
                    key={employee.id}
                    className="employees-row"
                    tabIndex={0}
                    onClick={(event) => {
                      if (
                        (event.target as HTMLElement).closest(
                          "button, a, input, select, label",
                        )
                      ) {
                        return;
                      }
                      navigate(`/employees/${employee.id}?business=${selectedId}`);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        navigate(`/employees/${employee.id}?business=${selectedId}`);
                      }
                    }}
                  >
                    <td>
                      <div className="employees-person">
                        <span className="employees-avatar">
                          {initials(employee.display_name)}
                          <span
                            className={`employees-avatar__dot employees-avatar__dot--${state}`}
                          />
                        </span>
                        <span className="employees-person__copy">
                          <span className="employees-person__name">
                            {employee.display_name}
                          </span>
                          <span className="employees-person__status">{statusLabel}</span>
                        </span>
                      </div>
                    </td>
                    <td className="employees-login">
                      {employee.email || employee.username || "—"}
                    </td>
                    <td>
                      <MemberRoleControl
                        employee={employee}
                        businessId={selectedId}
                        canChange={mayManageRoles}
                        onChanged={() => loadEmployees(selectedId)}
                      />
                    </td>
                    <td>
                      <MemberMonitoringControl
                        employee={employee}
                        businessId={selectedId}
                        canChange={mayManageThis}
                        onChanged={() => loadEmployees(selectedId)}
                      />
                    </td>
                    <td>
                      <div className="employees-app">
                        <div className="employees-app__name">
                          {showCurrentApp ? employee.current_app : "—"}
                        </div>
                        {showCurrentApp && employee.current_window && (
                          <div className="employees-app__window">
                            {employee.current_window}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="employees-last-seen">
                      {relativeTime(employee.last_seen)}
                    </td>
                    <td>
                      <EmployeeActionsMenu
                        employee={employee}
                        businessId={selectedId}
                        canManage={mayManageThis}
                        canDelete={mayManageRoles}
                        onChanged={() => loadEmployees(selectedId)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showBusiness && (
        <NewBusinessDialog
          terms={terms}
          kind={selected?.kind}
          onClose={() => setShowBusiness(false)}
          onCreated={async (id) => {
            setShowBusiness(false);
            await reloadBusinesses();
            setSelectedId(id);
          }}
        />
      )}

      {showEmployee && mayManageMembers && (
        <NewEmployeeDialog
          businessId={selectedId}
          terms={terms}
          onClose={() => setShowEmployee(false)}
          onCreated={async (newBusinessId, wasAutoCreated) => {
            setShowEmployee(false);
            if (wasAutoCreated) {
              await reloadBusinesses();
              setSelectedId(newBusinessId);
              pushToast({
                title: t("employees.autoCreatedNote", { member: terms.lowerOne }),
                tone: "success",
              });
            } else if (selectedId) {
              loadEmployees(selectedId);
              pushToast({ title: t("employees.prompts.saved"), tone: "success" });
            }
          }}
        />
      )}
    </div>
  );
}
