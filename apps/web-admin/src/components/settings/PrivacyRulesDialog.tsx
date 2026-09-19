import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  createPrivacyRule,
  deletePrivacyRule,
  getPrivacyApps,
  listPrivacyRules,
  updatePrivacyRule,
} from "../../api/endpoints";
import type {
  PrivacyAppCategory,
  PrivacyRule,
  PrivacyRuleKind,
  PrivacyRuleMatchType,
} from "../../api/types";
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  Skeleton,
  Switch,
  TextField,
} from "../ds";
import { useToast } from "../ToastProvider";

function ruleKey(rule: Pick<PrivacyRule, "kind" | "match_type" | "pattern">) {
  return `${rule.kind}:${rule.match_type}:${rule.pattern.trim().toLowerCase()}`;
}

export function PrivacyRulesDialog({
  businessId,
  open,
  onClose,
}: {
  businessId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation("settings");
  const { pushToast } = useToast();

  const [rules, setRules] = useState<PrivacyRule[]>([]);
  const [categories, setCategories] = useState<PrivacyAppCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<PrivacyRuleKind>("app");
  const [matchType, setMatchType] = useState<PrivacyRuleMatchType>("exact");
  const [pattern, setPattern] = useState("");

  const [editRule, setEditRule] = useState<PrivacyRule | null>(null);
  const [editKind, setEditKind] = useState<PrivacyRuleKind>("app");
  const [editMatch, setEditMatch] = useState<PrivacyRuleMatchType>("exact");
  const [editPattern, setEditPattern] = useState("");

  const existingKeys = useMemo(
    () => new Set(rules.map((rule) => ruleKey(rule))),
    [rules],
  );

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [ruleResponse, appResponse] = await Promise.all([
        listPrivacyRules(businessId),
        getPrivacyApps(),
      ]);
      setRules(ruleResponse.rules);
      setCategories(appResponse.categories);
    } catch {
      setError(t("privacyRules.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    reload();
  }, [businessId, open]);

  useEffect(() => {
    if (kind === "window_title") setMatchType("contains");
  }, [kind]);

  if (!open) return null;

  async function addRule(event: FormEvent) {
    event.preventDefault();
    const value = pattern.trim();
    if (!value) return;
    setBusyId("new");
    setError(null);
    try {
      const response = await createPrivacyRule(businessId, {
        kind,
        match_type: kind === "window_title" ? "contains" : matchType,
        pattern: value,
      });
      setRules((current) => [...current, response.rule]);
      setPattern("");
      pushToast({ title: t("privacyRules.created"), tone: "success" });
    } catch {
      setError(t("privacyRules.saveFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function addSuggested(app: string) {
    const candidate = { kind: "app" as const, match_type: "exact" as const, pattern: app };
    if (existingKeys.has(ruleKey(candidate))) return;
    setBusyId(`preset:${app}`);
    setError(null);
    try {
      const response = await createPrivacyRule(businessId, candidate);
      setRules((current) => [...current, response.rule]);
    } catch {
      setError(t("privacyRules.saveFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleRule(rule: PrivacyRule, enabled: boolean) {
    setBusyId(rule.id);
    setError(null);
    try {
      const response = await updatePrivacyRule(businessId, rule.id, { enabled });
      setRules((current) =>
        current.map((item) => (item.id === rule.id ? response.rule : item)),
      );
    } catch {
      setError(t("privacyRules.saveFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function removeRule(rule: PrivacyRule) {
    setBusyId(rule.id);
    setError(null);
    try {
      await deletePrivacyRule(businessId, rule.id);
      setRules((current) => current.filter((item) => item.id !== rule.id));
      pushToast({ title: t("privacyRules.deleted"), tone: "success" });
    } catch {
      setError(t("privacyRules.deleteFailed"));
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(rule: PrivacyRule) {
    setEditRule(rule);
    setEditKind(rule.kind);
    setEditMatch(rule.match_type);
    setEditPattern(rule.pattern);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editRule || !editPattern.trim()) return;
    setBusyId(editRule.id);
    setError(null);
    try {
      const response = await updatePrivacyRule(businessId, editRule.id, {
        kind: editKind,
        match_type: editKind === "window_title" ? "contains" : editMatch,
        pattern: editPattern.trim(),
      });
      setRules((current) =>
        current.map((item) => (item.id === editRule.id ? response.rule : item)),
      );
      setEditRule(null);
      pushToast({ title: t("privacyRules.saved"), tone: "success" });
    } catch {
      setError(t("privacyRules.saveFailed"));
    } finally {
      setBusyId(null);
    }
  }

  const appRules = rules.filter((rule) => rule.kind === "app");
  const titleRules = rules.filter((rule) => rule.kind === "window_title");

  return (
    <>
      <Dialog
        title={t("privacyRules.title")}
        size="complex"
        onClose={() => busyId === null && onClose()}
        closeOnBackdrop={busyId === null}
        footer={
          <Button variant="primary" disabled={busyId !== null} onClick={onClose}>
            {t("privacyRules.done")}
          </Button>
        }
      >
        <div className="settings-dialog-stack privacy-rules">
          <Alert tone="info">{t("privacyRules.preventCapture")}</Alert>

          <form className="privacy-rules__new" onSubmit={addRule}>
            <div className="privacy-rules__selectors">
              <label className="privacy-rules__field">
                <span>{t("privacyRules.kind")}</span>
                <select
                  className="ds-select"
                  value={kind}
                  disabled={busyId !== null}
                  onChange={(event) =>
                    setKind(event.currentTarget.value as PrivacyRuleKind)
                  }
                >
                  <option value="app">{t("privacyRules.kinds.app")}</option>
                  <option value="window_title">{t("privacyRules.kinds.windowTitle")}</option>
                </select>
              </label>

              <label className="privacy-rules__field">
                <span>{t("privacyRules.match")}</span>
                <select
                  className="ds-select"
                  value={kind === "window_title" ? "contains" : matchType}
                  disabled={busyId !== null || kind === "window_title"}
                  onChange={(event) =>
                    setMatchType(event.currentTarget.value as PrivacyRuleMatchType)
                  }
                >
                  <option value="exact">{t("privacyRules.matches.exact")}</option>
                  <option value="contains">{t("privacyRules.matches.contains")}</option>
                </select>
              </label>
            </div>

            <div className="privacy-rules__pattern">
              <TextField
                id="privacy-rule-pattern"
                label={t("privacyRules.pattern")}
                value={pattern}
                maxLength={200}
                disabled={busyId !== null}
                placeholder={
                  kind === "app"
                    ? t("privacyRules.appPlaceholder")
                    : t("privacyRules.titlePlaceholder")
                }
                onChange={(event) => setPattern(event.target.value)}
              />
              <Button
                type="submit"
                variant="secondary"
                loading={busyId === "new"}
                disabled={busyId !== null || !pattern.trim()}
              >
                {t("privacyRules.add")}
              </Button>
            </div>
          </form>

          {error && <Alert tone="danger">{error}</Alert>}

          {loading ? (
            <div className="privacy-rules__list">
              <Skeleton height={62} />
              <Skeleton height={62} />
              <Skeleton height={62} />
            </div>
          ) : rules.length === 0 ? (
            <EmptyState
              title={t("privacyRules.empty")}
              description={t("privacyRules.emptyDescription")}
            />
          ) : (
            <div className="privacy-rules__groups">
              {[
                ["app", appRules, t("privacyRules.groups.apps")],
                ["window_title", titleRules, t("privacyRules.groups.windowTitles")],
              ].map(([groupKey, groupRules, label]) => {
                const list = groupRules as PrivacyRule[];
                if (!list.length) return null;
                return (
                  <section className="privacy-rules__group" key={String(groupKey)}>
                    <h3>{String(label)}</h3>
                    <div className="privacy-rules__list">
                      {list.map((rule) => (
                        <div className="privacy-rules__row" key={rule.id}>
                          <div className="privacy-rules__copy">
                            <strong>{rule.pattern}</strong>
                            <span>
                              {t(`privacyRules.kinds.${rule.kind === "app" ? "app" : "windowTitle"}`)}
                              {" · "}
                              {t(`privacyRules.matches.${rule.match_type}`)}
                            </span>
                          </div>
                          <div className="privacy-rules__actions">
                            <Switch
                              checked={rule.enabled}
                              disabled={busyId !== null}
                              label={
                                rule.enabled
                                  ? t("foundation.enabled")
                                  : t("foundation.disabled")
                              }
                              onCheckedChange={(enabled) => toggleRule(rule, enabled)}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busyId !== null}
                              onClick={() => startEdit(rule)}
                            >
                              {t("privacyRules.edit")}
                            </Button>
                            <Button
                              variant="danger-ghost"
                              size="sm"
                              loading={busyId === rule.id}
                              disabled={busyId !== null && busyId !== rule.id}
                              onClick={() => removeRule(rule)}
                            >
                              {t("privacyRules.delete")}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {categories.length > 0 && (
            <section className="privacy-rules__suggestions">
              <h3>{t("privacyRules.suggestions")}</h3>
              <p>{t("privacyRules.suggestionsHelp")}</p>
              {categories.map((category) => (
                <div className="privacy-rules__suggestion-group" key={category.key}>
                  <strong>{t(`skipApps.cat${category.key}`)}</strong>
                  <div className="settings-chip-group">
                    {category.apps.map((app) => {
                      const exists = existingKeys.has(
                        ruleKey({ kind: "app", match_type: "exact", pattern: app }),
                      );
                      return (
                        <button
                          key={app}
                          type="button"
                          className={`settings-chip${exists ? " is-active" : ""}`}
                          disabled={exists || busyId !== null}
                          onClick={() => addSuggested(app)}
                        >
                          {exists ? "✓ " : "+ "}
                          {app}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      </Dialog>

      {editRule && (
        <Dialog
          title={t("privacyRules.editTitle")}
          size="confirm"
          onClose={() => busyId === null && setEditRule(null)}
          closeOnBackdrop={busyId === null}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={busyId !== null}
                onClick={() => setEditRule(null)}
              >
                {t("foundation.cancel")}
              </Button>
              <Button
                type="submit"
                form="privacy-rule-edit"
                variant="primary"
                loading={busyId === editRule.id}
                disabled={!editPattern.trim()}
              >
                {t("foundation.save")}
              </Button>
            </>
          }
        >
          <form id="privacy-rule-edit" className="account-v1__form" onSubmit={saveEdit}>
            <label className="privacy-rules__field">
              <span>{t("privacyRules.kind")}</span>
              <select
                className="ds-select"
                value={editKind}
                disabled={busyId !== null}
                onChange={(event) => {
                  const next = event.currentTarget.value as PrivacyRuleKind;
                  setEditKind(next);
                  if (next === "window_title") setEditMatch("contains");
                }}
              >
                <option value="app">{t("privacyRules.kinds.app")}</option>
                <option value="window_title">{t("privacyRules.kinds.windowTitle")}</option>
              </select>
            </label>
            <label className="privacy-rules__field">
              <span>{t("privacyRules.match")}</span>
              <select
                className="ds-select"
                value={editKind === "window_title" ? "contains" : editMatch}
                disabled={busyId !== null || editKind === "window_title"}
                onChange={(event) =>
                  setEditMatch(event.currentTarget.value as PrivacyRuleMatchType)
                }
              >
                <option value="exact">{t("privacyRules.matches.exact")}</option>
                <option value="contains">{t("privacyRules.matches.contains")}</option>
              </select>
            </label>
            <TextField
              id="privacy-rule-edit-pattern"
              label={t("privacyRules.pattern")}
              value={editPattern}
              maxLength={200}
              disabled={busyId !== null}
              onChange={(event) => setEditPattern(event.target.value)}
            />
          </form>
        </Dialog>
      )}
    </>
  );
}
