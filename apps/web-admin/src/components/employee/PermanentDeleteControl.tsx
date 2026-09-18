import { useState } from "react";
import { useTranslation } from "react-i18next";
import { permanentlyDeleteMember } from "../../api/endpoints";
import type { Employee } from "../../api/types";
import { Alert, Button, Dialog, TextField } from "../ds";

export function PermanentDeleteControl({
  employee,
  businessId,
  canDelete,
  onDeleted,
  triggerVariant = "button",
}: {
  employee: Employee;
  businessId: string;
  canDelete: boolean;
  onDeleted: () => void;
  triggerVariant?: "button" | "menu-item";
}) {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canDelete || employee.role === "owner") return null;

  const matches = confirmText.trim() === employee.display_name.trim();

  function start() {
    setConfirmText("");
    setError(null);
    setOpen(true);
  }

  async function purge() {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await permanentlyDeleteMember(businessId, employee.id);
      setOpen(false);
      setConfirmText("");
      onDeleted();
    } catch {
      setError(t("employees.purge.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {triggerVariant === "menu-item" ? (
        <button type="button" className="ds-menu__item ds-menu__item--danger" onClick={start}>
          {t("employees.actions.purge")}
        </button>
      ) : (
        <Button variant="danger-ghost" size="sm" onClick={start}>
          {t("employees.actions.purge")}
        </Button>
      )}

      {open && (
        <Dialog
          title={t("employees.purge.title", { name: employee.display_name })}
          size="confirm"
          onClose={() => !busy && setOpen(false)}
          closeOnBackdrop={!busy}
          footer={
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
                {t("employees.purge.cancel")}
              </Button>
              <Button
                variant="danger"
                loading={busy}
                disabled={!matches || busy}
                onClick={purge}
              >
                {busy ? t("employees.purge.deleting") : t("employees.purge.delete")}
              </Button>
            </>
          }
        >
          <div className="employees-dialog-stack">
            <Alert tone="danger">{t("employees.purge.warning")}</Alert>
            <p className="employees-dialog-note">{t("employees.purge.scope")}</p>
            <TextField
              id={`purge-confirm-${employee.id}`}
              label={t("employees.purge.confirmLabel", { name: employee.display_name })}
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
            {error && <Alert tone="danger">{error}</Alert>}
          </div>
        </Dialog>
      )}
    </>
  );
}
