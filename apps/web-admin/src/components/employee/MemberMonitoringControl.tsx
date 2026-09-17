import { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateMemberMonitoring } from "../../api/endpoints";
import type { Employee } from "../../api/types";

export function MemberMonitoringControl({ employee, businessId, canChange, onChanged }: {
  employee: Employee;
  businessId: string;
  canChange: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const [busy, setBusy] = useState(false);
  const enabled = employee.monitoring_enabled !== false;

  if (!canChange) {
    return <span className="ad-self">{t(enabled ? "employees.monitoring.on" : "employees.monitoring.off")}</span>;
  }

  return (
    <button
      type="button"
      className={`actilens-btn actilens-btn--ghost${enabled ? "" : " muted"}`}
      disabled={busy}
      aria-pressed={enabled}
      aria-label={t("employees.monitoring.aria", { name: employee.display_name })}
      onClick={async () => {
        setBusy(true);
        try {
          await updateMemberMonitoring(businessId, employee.id, !enabled);
          onChanged();
        } catch {
          window.alert(t("employees.prompts.failed"));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? t("employees.monitoring.saving") : t(enabled ? "employees.monitoring.on" : "employees.monitoring.off")}
    </button>
  );
}
