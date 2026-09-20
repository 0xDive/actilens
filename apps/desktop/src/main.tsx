import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/manrope";
import "./theme.css";
import "./v1.css";
import "./i18n";
import App from "./App";
import { initSentry, Sentry } from "./sentry";

try {
  initSentry();
} catch (error) {
  // Error reporting must never be able to prevent the product UI from booting.
  console.error("Sentry initialization failed", error);
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("ActiLens root element is missing");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div style={{ padding: 32, fontFamily: "Segoe UI, system-ui, sans-serif" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 20 }}>ActiLens could not start</h1>
          <p style={{ margin: 0, color: "#6b7280" }}>
            The desktop interface encountered an unexpected error.
          </p>
        </div>
      }
    >
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
