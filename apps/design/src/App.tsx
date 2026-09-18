import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, Switch } from "./ui";

type ThemeMode = "light" | "dark" | "system";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") {
    root.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    return;
  }
  root.dataset.theme = mode;
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [monitoring, setMonitoring] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyTheme("system");
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, [theme]);

  return (
    <div className="fixture-app">
      <header className="fixture-topbar">
        <div>
          <div className="fixture-brand">ActiLens Design System v1</div>
          <div className="fixture-muted">Live component and state fixtures</div>
        </div>

        <label className="fixture-theme">
          <span>Theme</span>
          <select
            value={theme}
            onChange={(event) => setTheme(event.currentTarget.value as ThemeMode)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </label>
      </header>

      <main className="fixture-main">
        <section className="fixture-hero">
          <div>
            <div className="fixture-kicker">Design foundation</div>
            <h1>Calm, precise product UI</h1>
            <p>
              Neutral surfaces, one violet brand accent, semantic status colors,
              compact controls and consistent information density.
            </p>
          </div>
          <Badge tone="brand">v1 approved</Badge>
        </section>

        <section className="fixture-section">
          <div className="fixture-section__head">
            <h2>Color tokens</h2>
            <p>Only semantic colors are used by product components.</p>
          </div>
          <div className="fixture-swatches">
            {[
              ["App", "app"],
              ["Surface", "surface"],
              ["Subtle", "subtle"],
              ["Brand", "brand"],
              ["Success", "success"],
              ["Warning", "warning"],
              ["Danger", "danger"],
            ].map(([label, token]) => (
              <div className="fixture-swatch" key={token}>
                <span className={`fixture-swatch__color fixture-swatch__color--${token}`} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="fixture-section">
          <div className="fixture-section__head">
            <h2>Buttons</h2>
            <p>One primary action per local action group.</p>
          </div>
          <Card>
            <div className="fixture-row">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="primary" disabled>
                Disabled
              </Button>
            </div>
          </Card>
        </section>

        <section className="fixture-section">
          <div className="fixture-section__head">
            <h2>Status and metadata</h2>
            <p>Semantic colors communicate actual state, not decoration.</p>
          </div>
          <Card>
            <div className="fixture-row">
              <Badge>Employee</Badge>
              <Badge tone="brand">Admin</Badge>
              <Badge tone="success">Online</Badge>
              <Badge tone="warning">Idle</Badge>
              <Badge tone="danger">Blocked</Badge>
            </div>
          </Card>
        </section>

        <section className="fixture-section">
          <div className="fixture-section__head">
            <h2>Forms and controls</h2>
            <p>40 px fields, explicit labels, readable disabled and error states.</p>
          </div>
          <Card>
            <div className="fixture-form-grid">
              <Field
                id="fixture-name"
                label="Display name"
                placeholder="Jordan Lee"
              />
              <Field
                id="fixture-login"
                label="Username or email"
                description="Used to sign in from the desktop app."
                placeholder="jordan"
              />
              <Field
                id="fixture-error"
                label="Validation example"
                aria-invalid="true"
                value="taken-login"
                readOnly
              />
              <div className="fixture-control-block">
                <div className="fixture-control-label">Monitoring</div>
                <Switch
                  checked={monitoring}
                  label={monitoring ? "Enabled" : "Disabled"}
                  onChange={setMonitoring}
                />
              </div>
            </div>
          </Card>
        </section>

        <section className="fixture-section">
          <div className="fixture-section__head">
            <h2>Table density</h2>
            <p>64 px rows with status, role, operational state and one action menu.</p>
          </div>
          <div className="fixture-table-wrap">
            <table className="fixture-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Login</th>
                  <th>Role</th>
                  <th>Monitoring</th>
                  <th>Current app</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div className="fixture-person">
                      <span className="fixture-avatar">JL</span>
                      <span>
                        <strong>Jordan Lee</strong>
                        <small>Online</small>
                      </span>
                    </div>
                  </td>
                  <td>jordan</td>
                  <td><Badge>Employee</Badge></td>
                  <td><Badge tone="success">Enabled</Badge></td>
                  <td>Microsoft Word</td>
                  <td><Button size="sm" variant="ghost">•••</Button></td>
                </tr>
                <tr>
                  <td>
                    <div className="fixture-person">
                      <span className="fixture-avatar">AK</span>
                      <span>
                        <strong>Alex Kim</strong>
                        <small>Idle</small>
                      </span>
                    </div>
                  </td>
                  <td>alex</td>
                  <td><Badge tone="brand">Admin</Badge></td>
                  <td><Badge tone="success">Enabled</Badge></td>
                  <td>Slack</td>
                  <td><Button size="sm" variant="ghost">•••</Button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="fixture-section">
          <div className="fixture-section__head">
            <h2>Destructive flow</h2>
            <p>Destructive actions are separated from normal work and explicitly confirmed.</p>
          </div>
          <Card>
            <Button variant="danger" onClick={() => setDialogOpen(true)}>
              Open delete confirmation
            </Button>
          </Card>
        </section>
      </main>

      {dialogOpen && (
        <div
          className="fixture-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setDialogOpen(false);
          }}
        >
          <div className="fixture-dialog" role="dialog" aria-modal="true" aria-labelledby="fixture-dialog-title">
            <h2 id="fixture-dialog-title">Permanently delete employee</h2>
            <p>
              Activity, screenshots and monitoring data for this organization will
              be permanently removed.
            </p>
            <div className="fixture-dialog__actions">
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setDialogOpen(false)}>
                Delete permanently
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
