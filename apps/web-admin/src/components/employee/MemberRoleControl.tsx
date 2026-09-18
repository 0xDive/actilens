import { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateMemberRole } from "../../api/endpoints";
import type { BusinessRole, Employee } from "../../api/types";
import { Badge, cx } from "../ds";
import { useToast } from "../ToastProvider";

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
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const role: Exclude<BusinessRole, "owner"> =
    employee.role === "admin" || employee.role === "manager" ? employee.role : "employee";

  if (!canChange) {
    const tone = role === "admin" ? "brand" : role === "manager" ? "info" : "neutral";
    return <Badge tone={tone}>{t(`employees.roles.${role}`)}</Badge>;
  }

  return (
    <select
      className={cx("ds-select", "employees-role-select")}
      aria-label={t("employees.roleAria", { name: employee.display_name })}
      value={role}
      disabled={busy}
      onChange={async (event) => {
        const next = event.target.value as Exclude<BusinessRole, "owner">;
        if (next === role) return;
        setBusy(true);
        try {
          await updateMemberRole(businessId, employee.id, next);
          onChanged();
        } catch {
          pushToast({
            title: t("employees.prompts.failed"),
            tone: "danger",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      {EDITABLE_ROLES.map((item) => (
        <option key={item} value={item}>
          {t(`employees.roles.${item}`)}
        </option>
      ))}
    </select>
  );
}
