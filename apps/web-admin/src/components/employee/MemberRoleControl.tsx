import { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateMemberRole } from "../../api/endpoints";
import type { BusinessRole, Employee } from "../../api/types";

const EDITABLE_ROLES: Exclude<BusinessRole, "owner">[] = ["employee", "manager", "admin"];

export function MemberRoleControl({
  employee,
  businessId,
  canChange,
  onChanged,
}: {
  employee: Employee;
  businessId: string;
  canChange: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const [busy, setBusy] = useState(false);
  const role: Exclude<BusinessRole, "owner"> =
    employee.role === "admin" || employee.role === "manager" ? employee.role : "employee";

  if (!canChange) {
    return (
      <span className="ad-self" style={{ textTransform: "none" }}>
        {t(`employees.roles.${role}`)}
      </span>
    );
  }

  return (
    <select
      aria-label={t("employees.roleAria", { name: employee.display_name })}
      value={role}
      disabled={busy}
      onChange={async (e) => {
        const next = e.target.value as Exclude<BusinessRole, "owner">;
        if (next === role) return;
        setBusy(true);
        try {
          await updateMemberRole(businessId, employee.id, next);
          onChanged();
        } catch {
          window.alert(t("employees.prompts.failed"));
        } finally {
          setBusy(false);
        }
      }}
      style={{
        minWidth: 108,
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "6px 8px",
        background: "var(--surface)",
        color: "var(--text)",
        font: "inherit",
      }}
    >
      {EDITABLE_ROLES.map((r) => (
        <option key={r} value={r}>{t(`employees.roles.${r}`)}</option>
      ))}
    </select>
  );
}
