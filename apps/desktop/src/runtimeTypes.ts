export type AppSettings = {
  theme: string;
  idle_threshold_s: number;
  screenshot_interval_s: number;
  screenshot_retention_days: number;
  domain_only: boolean;
  collect_app_activity: boolean;
  collect_window_titles: boolean;
  collect_browser_activity: boolean;
  start_at_login: boolean;
  hide_dock: boolean;
  capture_screenshots: boolean;
  screenshot_mode: string;
  screenshot_capture_scope: string;
  screenshot_privacy_rules: {
    id: string;
    kind: string;
    match_type: string;
    pattern: string;
    enabled: boolean;
  }[];
  screenshot_skip_apps: string[];
  count_keystrokes: boolean;
  consented: boolean;
  local_only: boolean;
  last_managed_business_id: string | null;
  collection_scope_dirty: boolean;
  onboarding_completed: boolean;
  device_id: string;
  locale: string;
  org_monitoring_enabled: boolean;
  last_policy_sync_ts: number;
};

export type CaptureManaged = {
  managed: boolean;
  allow_employee_override: boolean;
  family: boolean;
  monitoring_enabled: boolean;
};

export type AgentState = "running" | "idle" | "paused" | "blocked";
export type ConnectionState =
  | "online"
  | "offline"
  | "checking"
  | "signed_out"
  | "local";
export type SyncState =
  | "synced"
  | "syncing"
  | "queued"
  | "error"
  | "signed_out"
  | "local";
export type DeviceState = "active" | "revoked" | "blocked" | "enrollment_required" | "local";

export type RuntimeState = {
  agent: AgentState;
  connection: ConnectionState;
  sync: SyncState;
  device: DeviceState;
  reason: string;
  last_sync_ts: number;
  last_attempt_ts: number;
  last_policy_ts: number;
  pending: number;
  syncing: boolean;
  last_error: string;
  permission_attention: number;
  device_id: string;
  app_version: string;
  os: string;
  arch: string;
  hostname: string;
  email: string;
  business_id: string;
  business_name: string;
  local_only: boolean;
  managed: boolean;
  pause_allowed: boolean;
  browser_bridge_ready: boolean;
  autostart_supported: boolean;
  autostart_enabled: boolean;
};

export type DiagnosticCheck = {
  key: string;
  state: "ok" | "warning" | "error";
  detail: string;
};

export type DiagnosticsReport = {
  generated_at: number;
  checks: DiagnosticCheck[];
};
