import { useState } from "react";
import { useTranslation } from "react-i18next";
import { permanentlyDeleteMember } from "../../api/endpoints";
import type { Employee } from "../../api/types";
import { Modal, Notice } from "../ui";

export function PermanentDeleteControl({
  employee,
  businessId,
  canDelete,
  onDeleted,
}: {
  employee: Employee;
  businessId: string;
  canDelete: boolean;
  onDeleted: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canDelete || employee.role === "owner") return null;

  const matches = confirmText.trim() === employee.display_name.trim();

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
      <button
        type="button"
        className="actilens-btn actilens-btn--ghost"
        onClick={() => {
          setConfirmText("");
          setError(null);
          setOpen(true);
        }}
      >
        {t("employees.actions.purge")}
      </button>

      {open && (
        <Modal
          title={t("employees.purge.title", { name: employee.display_name })}
          onClose={() => !busy && setOpen(false)}
        >
          <div style={{ display: "grid", gap: 14, minWidth: 500, maxWidth: 640 }}>
            <Notice kind="danger">{t("employees.purge.warning")}</Notice>
            <div style={{ fontSize: 13, lineHeight: 1.55 }}>
              {t("employees.purge.scope")}
            </div>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 650 }}>
                {t("employees.purge.confirmLabel", { name: employee.display_name })}
              </span>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
            </label>
            {error && <Notice kind="danger">{error}</Notice>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="actilens-btn actilens-btn--secondary"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                {t("employees.purge.cancel")}
              </button>
              <button
                type="button"
                className="actilens-btn actilens-btn--primary"
                disabled={!matches || busy}
                onClick={purge}
              >
                {busy ? t("employees.purge.deleting") : t("employees.purge.delete")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
