import {
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createBusiness, createEmployee, register } from "../api/endpoints";
import { ApiError, type AccountType } from "../api/types";
import { Alert, Button, TextField } from "../components/ds";
import { memberTerms } from "../terms";
import { useAuth } from "./AuthContext";
import { AuthLayout } from "./AuthLayout";

const DOWNLOAD_URL = import.meta.env.VITE_DOWNLOAD_URL || "/";

type Step = "persona" | "personal" | "account" | "setup" | "members" | "done";
type AddedMember = {
  display_name: string;
  login: string;
  password: string;
};
type PasswordLevel = "weak" | "medium" | "strong";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
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

function PasswordStrength({ password }: { password: string }) {
  const { t } = useTranslation("signup");
  if (!password) return null;

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  const level: PasswordLevel =
    password.length < 8 || score <= 1
      ? "weak"
      : score <= 3
        ? "medium"
        : "strong";

  return (
    <div className="auth-v1__strength">
      <span className="auth-v1__strength-track">
        <span
          className={`auth-v1__strength-fill auth-v1__strength-fill--${level}`}
        />
      </span>
      <span className="auth-v1__strength-label">
        {t(`account.strength.${level}`)}
      </span>
    </div>
  );
}

function WizardProgress({ current }: { current: number }) {
  const { t } = useTranslation("ui");
  return (
    <div className="auth-v1__progress">
      <div className="auth-v1__progress-top">
        <span>{t("stepProgress", { current, total: 5 })}</span>
      </div>
      <div className="auth-v1__progress-track" aria-hidden>
        {Array.from({ length: 5 }, (_, index) => {
          const step = index + 1;
          return (
            <span
              key={step}
              className={`auth-v1__progress-step${
                step < current
                  ? " is-done"
                  : step === current
                    ? " is-current"
                    : ""
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

function orgSlug(orgName: string): string {
  return (
    orgName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20) || "team"
  );
}

function suggestUsername(orgName: string, abbreviation: string, number: number) {
  return `${orgSlug(orgName)}_${abbreviation}${number}`;
}

function genTempPassword(): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => chars[value % chars.length]).join("");
}

async function copyText(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy failed");
}

export function SignupWizard() {
  const { t } = useTranslation("signup");
  const navigate = useNavigate();
  const { setSession } = useAuth();

  const [step, setStep] = useState<Step>("persona");
  const [persona, setPersona] = useState<AccountType>("manager");
  const [displayName, setDisplayName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [members, setMembers] = useState<AddedMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const terms = memberTerms(persona === "parent" ? "family" : "team");
  const noun = terms.org;

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const response = await register(
        login.trim(),
        password,
        displayName.trim(),
        persona,
      );
      setSession(response.user);
      setStep("setup");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errors.server"));
    } finally {
      setBusy(false);
    }
  }

  async function finishSetup(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const business = await createBusiness(orgName.trim());
      setBusinessId(business.id);
      setStep("members");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errors.server"));
    } finally {
      setBusy(false);
    }
  }

  if (step === "persona") {
    return (
      <AuthLayout wide>
        <section className="auth-v1__card">
          <WizardProgress current={1} />
          <h1 className="auth-v1__title">{t("persona.heading")}</h1>
          <p className="auth-v1__subtitle">{t("persona.sub")}</p>

          <div className="auth-v1__choices">
            <button
              type="button"
              className="auth-v1__choice"
              onClick={() => setStep("personal")}
            >
              <span className="auth-v1__choice-icon">
                <Icon>
                  <circle cx="12" cy="8" r="4" />
                  <path d="M5 21a7 7 0 0 1 14 0" />
                </Icon>
              </span>
              <span>
                <span className="auth-v1__choice-title">
                  {t("persona.justMeTitle")}
                </span>
                <span className="auth-v1__choice-description">
                  {t("persona.justMeDesc")}
                </span>
              </span>
              <span className="auth-v1__choice-arrow">→</span>
            </button>

            <button
              type="button"
              className="auth-v1__choice"
              onClick={() => {
                setPersona("manager");
                setStep("account");
              }}
            >
              <span className="auth-v1__choice-icon">
                <Icon>
                  <circle cx="9" cy="8" r="3" />
                  <circle cx="17" cy="9" r="2.5" />
                  <path d="M3 21a6 6 0 0 1 12 0" />
                  <path d="M14 16a5 5 0 0 1 7 5" />
                </Icon>
              </span>
              <span>
                <span className="auth-v1__choice-title">
                  {t("persona.teamTitle")}
                </span>
                <span className="auth-v1__choice-description">
                  {t("persona.teamDesc")}
                </span>
              </span>
              <span className="auth-v1__choice-arrow">→</span>
            </button>

            <button
              type="button"
              className="auth-v1__choice"
              onClick={() => {
                setPersona("parent");
                setStep("account");
              }}
            >
              <span className="auth-v1__choice-icon">
                <Icon>
                  <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
                </Icon>
              </span>
              <span>
                <span className="auth-v1__choice-title">
                  {t("persona.familyTitle")}
                </span>
                <span className="auth-v1__choice-description">
                  {t("persona.familyDesc")}
                </span>
              </span>
              <span className="auth-v1__choice-arrow">→</span>
            </button>
          </div>

          <div className="auth-v1__actions">
            <Button variant="ghost" onClick={() => navigate("/login")}>
              ← {t("persona.back")}
            </Button>
          </div>
        </section>
      </AuthLayout>
    );
  }

  if (step === "personal") {
    return (
      <AuthLayout>
        <section className="auth-v1__card">
          <h1 className="auth-v1__title">{t("personal.heading")}</h1>
          <p className="auth-v1__subtitle">{t("personal.sub")}</p>

          <div className="auth-v1__download-actions">
            <a
              className="ds-button ds-button--lg ds-button--primary"
              href={DOWNLOAD_URL}
            >
              {t("personal.downloadWindows")}
            </a>
            <a
              className="ds-button ds-button--lg ds-button--secondary"
              href={DOWNLOAD_URL}
            >
              {t("personal.downloadMac")}
            </a>
          </div>

          <p className="auth-v1__note">{t("personal.caption")}</p>

          <div className="auth-v1__actions">
            <Button variant="ghost" onClick={() => setStep("persona")}>
              {t("personal.back")}
            </Button>
          </div>
        </section>
      </AuthLayout>
    );
  }

  if (step === "account") {
    const ready =
      displayName.trim() !== "" &&
      login.trim() !== "" &&
      password.length >= 8;

    return (
      <AuthLayout>
        <section className="auth-v1__card">
          <WizardProgress current={2} />
          <h1 className="auth-v1__title">{t("account.title")}</h1>
          <p className="auth-v1__subtitle">{t("account.sub")}</p>

          {error && (
            <div className="auth-v1__error">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}

          <form className="auth-v1__form" onSubmit={createAccount}>
            <TextField
              id="signup-name"
              label={t("account.name")}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              autoComplete="name"
              autoFocus
            />

            <TextField
              id="signup-identifier"
              label={t("account.identifier")}
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t("account.identifierPlaceholder")}
            />

            <div>
              <TextField
                id="signup-password"
                label={t("account.password")}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder={t("account.passwordPlaceholder")}
              />
              <PasswordStrength password={password} />
            </div>

            <div className="auth-v1__actions">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setStep("persona");
                }}
              >
                ← {t("persona.back")}
              </Button>
              <div className="auth-v1__actions-right">
                <Button
                  type="submit"
                  variant="primary"
                  loading={busy}
                  disabled={!ready}
                >
                  {busy ? t("account.creating") : t("account.continue")}
                </Button>
              </div>
            </div>
          </form>
        </section>
      </AuthLayout>
    );
  }

  if (step === "setup") {
    return (
      <AuthLayout>
        <section className="auth-v1__card">
          <WizardProgress current={3} />
          <h1 className="auth-v1__title">
            {t("setup.title", { noun })}
          </h1>
          <p className="auth-v1__subtitle">
            {t("setup.sub", { members: terms.lowerMany })}
          </p>

          {error && (
            <div className="auth-v1__error">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}

          <form className="auth-v1__form" onSubmit={finishSetup}>
            <TextField
              id="signup-org"
              label={t("setup.nameLabel", { noun })}
              value={orgName}
              onChange={(event) => setOrgName(event.target.value)}
              required
              placeholder={t(
                persona === "parent"
                  ? "setup.placeholderFamily"
                  : "setup.placeholderTeam",
              )}
              autoFocus
            />

            <div className="auth-v1__actions">
              <span />
              <Button
                type="submit"
                variant="primary"
                loading={busy}
                disabled={!orgName.trim()}
              >
                {busy ? t("setup.saving") : t("setup.continue")}
              </Button>
            </div>
          </form>
        </section>
      </AuthLayout>
    );
  }

  if (step === "members") {
    return (
      <AuthLayout wide>
        <AddMembers
          businessId={businessId}
          orgName={orgName}
          terms={terms}
          members={members}
          onAdded={(member) => setMembers((current) => [...current, member])}
          onFinish={() => setStep("done")}
        />
      </AuthLayout>
    );
  }

  const doneItems = [
    t("done.accountCreated"),
    t("done.orgReady", {
      noun: noun.charAt(0).toUpperCase() + noun.slice(1),
    }),
    members.length > 0
      ? t("done.membersAdded", {
          count: members.length,
          members:
            members.length === 1 ? terms.lowerOne : terms.lowerMany,
        })
      : t("done.membersLater", { members: terms.lowerMany }),
  ];

  return (
    <AuthLayout>
      <section className="auth-v1__card auth-v1__done">
        <WizardProgress current={5} />
        <div className="auth-v1__done-mark">✓</div>
        <h1 className="auth-v1__title">{t("done.title")}</h1>
        <p className="auth-v1__subtitle">{t("rail.doneDesc")}</p>

        <div className="auth-v1__done-list">
          {doneItems.map((item) => (
            <div className="auth-v1__done-item" key={item}>
              <span className="auth-v1__done-check">✓</span>
              <span>{item}</span>
            </div>
          ))}
        </div>

        <div className="auth-v1__actions">
          <span />
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate("/", { replace: true })}
          >
            {t("done.goToDashboard")}
          </Button>
        </div>
      </section>
    </AuthLayout>
  );
}

function AddMembers({
  businessId,
  orgName,
  terms,
  members,
  onAdded,
  onFinish,
}: {
  businessId: string | null;
  orgName: string;
  terms: ReturnType<typeof memberTerms>;
  members: AddedMember[];
  onAdded: (member: AddedMember) => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation("signup");
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [login, setLogin] = useState(() =>
    suggestUsername(orgName, terms.idAbbrev, members.length + 1),
  );
  const [password, setPassword] = useState(() => genTempPassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const suggested = suggestUsername(
    orgName,
    terms.idAbbrev,
    members.length + 1,
  );

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!businessId) {
      setError(t("errors.server"));
      return;
    }

    setError(null);
    setBusy(true);

    const identifier = login.trim();
    const email = identifier.includes("@");

    try {
      await createEmployee({
        email: email ? identifier : undefined,
        username: email ? undefined : identifier.toLowerCase(),
        password,
        display_name: name.trim(),
        business_id: businessId,
      });

      const added = {
        display_name: name.trim(),
        login: email ? identifier : identifier.toLowerCase(),
        password,
      };
      onAdded(added);

      const nextIndex = members.length + 2;
      setName("");
      setLogin(suggestUsername(orgName, terms.idAbbrev, nextIndex));
      setPassword(genTempPassword());
      nameRef.current?.focus();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 409 ? t("errors.taken") : err.message);
      } else {
        setError(
          t("errors.addMember", {
            member: terms.lowerOne,
          }),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyLogin(member: AddedMember, index: number) {
    const text = t("clipboard.text", {
      login: member.login,
      password: member.password,
    });

    try {
      await copyText(text);
      setCopied(index);
      window.setTimeout(
        () => setCopied((current) => (current === index ? null : current)),
        1600,
      );
    } catch {
      setError(t("v1.copyFailed"));
    }
  }

  return (
    <section className="auth-v1__card">
      <WizardProgress current={4} />
      <h1 className="auth-v1__title">
        {t("members.title", { members: terms.lowerMany })}
      </h1>
      <p className="auth-v1__subtitle">{t("members.sub")}</p>

      {error && (
        <div className="auth-v1__error">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <form className="auth-v1__member-form" onSubmit={add}>
        <TextField
          ref={nameRef}
          id="member-name"
          label={t("members.name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          placeholder={t("members.namePlaceholder")}
          autoFocus
        />

        <TextField
          id="member-login"
          label={t("members.loginLabel")}
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          required
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          placeholder={suggested}
        />

        <div className="auth-v1__member-form-full auth-v1__password-row">
          <TextField
            id="member-password"
            label={t("members.tempPassword")}
            type="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="off"
          />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setPassword(genTempPassword())}
          >
            {t("members.newPassword")}
          </Button>
        </div>

        <div className="auth-v1__member-form-full auth-v1__actions">
          <span className="auth-v1__note">
            {t("members.suggestion")}: <strong>{suggested}</strong>
          </span>
          <div className="auth-v1__actions-right">
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={
                !name.trim() || !login.trim() || password.length < 8
              }
            >
              {busy
                ? t("members.adding")
                : t("members.addCta", { cta: terms.addCta })}
            </Button>
          </div>
        </div>
      </form>

      {members.length > 0 && (
        <div className="auth-v1__member-list">
          {members.map((member, index) => (
            <div className="auth-v1__member" key={`${member.login}-${index}`}>
              <span className="auth-v1__member-check">✓</span>
              <div className="auth-v1__member-copy">
                <div className="auth-v1__member-name">
                  {member.display_name}
                </div>
                <div className="auth-v1__member-login">
                  {member.login} · ••••••••
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyLogin(member, index)}
              >
                {copied === index
                  ? t("members.copied")
                  : t("members.copyLogin")}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="auth-v1__actions">
        <span />
        <div className="auth-v1__actions-right">
          <Button variant="ghost" onClick={onFinish}>
            {t("members.skip")}
          </Button>
          <Button variant="primary" onClick={onFinish}>
            {t("members.finish")}
          </Button>
        </div>
      </div>
    </section>
  );
}
