import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/manrope";
import "./theme/theme.css";
import "./theme/foundation.css";
import "./theme/shell.css";
import "./i18n";
import App from "./App";
import { initSentry, Sentry } from "./sentry";
import { ToastProvider } from "./components/ToastProvider";

initSentry();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p style={{ padding: 24 }}>Something went wrong.</p>}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
