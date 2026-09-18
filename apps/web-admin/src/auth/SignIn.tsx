import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { login } from "../api/endpoints";
import { ApiError } from "../api/types";
import { Alert, Button, TextField } from "../components/ds";
import { useAuth } from "./AuthContext";
import { AuthLayout } from "./AuthLayout";

const DOWNLOAD_URL = import.meta.env.VITE_DOWNLOAD_URL || "/";

export function SignIn() {
  const navigate = useNavigate();
  const { t } = useTranslation("auth");
  const { setSession } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const response = await login(identifier.trim(), password);
      setSession(response.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t("errors.network"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <section className="auth-v1__card">
        <h1 className="auth-v1__title">{t("signIn.title")}</h1>
        <p className="auth-v1__subtitle">{t("signIn.subtitle")}</p>

        {error && (
          <div className="auth-v1__error">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        <form className="auth-v1__form" onSubmit={submit}>
          <TextField
            id="sign-in-identifier"
            label={t("signIn.identifier")}
            type="text"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t("signIn.identifierPlaceholder")}
            autoFocus
          />

          <TextField
            id="sign-in-password"
            label={t("signIn.password")}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />

          <div className="auth-v1__submit">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={busy}
              disabled={!identifier.trim() || !password}
            >
              {busy ? t("signIn.submitting") : t("signIn.submit")}
            </Button>
          </div>
        </form>

        <div className="auth-v1__footer">
          <span>
            {t("signIn.newHere")}{" "}
            <Link className="auth-v1__link" to="/signup">
              {t("signIn.createAccount")}
            </Link>
          </span>
          <a className="auth-v1__link" href={DOWNLOAD_URL}>
            {t("signIn.download")}
          </a>
        </div>
      </section>
    </AuthLayout>
  );
}
