import { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateMemberMonitoring } from "../../api/endpoints";
import type { Employee } from "../../api/types";
import { Badge, Switch } from "../ds";
import { useToast } from "../ToastProvider";

export function MemberMonitoringControl({
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
  const enabled = employee.monitoring_enabled !== false;
  const label = t(enabled ? "employees.monitoring.on" : "employees.monitoring.off");

  if (!canChange) {
    return <Badge tone={enabled ? "success" : "neutral"}>{label}</Badge>;
  }

  return (
    <Switch
      checked={enabled}
      disabled={busy}
      label={busy ? t("employees.monitoring.saving") : label}
      onCheckedChange={async (next) => {
        setBusy(true);
        try {
          await updateMemberMonitoring(businessId, employee.id, next);
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
    />
  );
}
