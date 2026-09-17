export interface PublicBusiness {
  business_id: string;
  name: string;
  owner_name: string;
}

export type AccountType = "manager" | "parent";

export interface User {
  id: string;
  email: string;
  username?: string;
  display_name: string;
  account_type: AccountType;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface AuthResponse {
  user: User;
  tokens: Tokens;
}

export type BusinessKind = "team" | "family";
export type ScreenshotMode = "privacy" | "normal";

export interface PrivacyAppCategory {
  key: string;
  apps: string[];
}

export interface Business {
  id: string;
  name: string;
  kind: BusinessKind;
  owner_user_id: string;
  screenshot_retention_days: number | null;
  screenshot_interval_s: number;
  idle_threshold_s: number;
  allow_employee_override: boolean;
  screenshot_mode: string;
  screenshot_skip_apps: string[];
}

export interface BusinessSettingsPatch {
  screenshot_retention_days?: number | null;
  screenshot_interval_s?: number;
  idle_threshold_s?: number;
  allow_employee_override?: boolean;
  screenshot_mode?: ScreenshotMode;
  screenshot_skip_apps?: string[];
}

export interface Employee {
  id: string;
  email: string;
  username?: string;
  display_name: string;
  active: boolean;
  last_seen?: number | null;
  current_app?: string | null;
  current_window?: string | null;
}

export interface Device {
  id: string;
  user_id: string;
  label: string;
  hostname: string;
  platform: string;
  arch: string;
  app_version: string;
  first_seen: number;
  last_seen: number | null;
  revoked_at: number | null;
}

export interface AuditEvent {
  id: number;
  business_id: string;
  actor_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown>;
  created_at: number;
}

export interface CreateEmployeeResponse {
  employee: Employee;
  business: Business;
}

export interface ReportEmployee {
  id: string;
  email: string;
  username?: string;
  display_name: string;
  role?: "owner" | "employee";
  last_seen: number | null;
  active_today_s: number;
  active_yesterday_s: number;
  screenshots_today: number;
  screenshots_yesterday: number;
  focus_pct_today: number | null;
}

export interface ActivitySample {
  ts: number;
  app_name: string;
  window_title: string;
  duration_s: number;
}

export interface AppBreakdown {
  app_name: string;
  duration_s: number;
}

export interface ActivityResponse {
  samples: ActivitySample[];
  breakdown: AppBreakdown[];
}

export interface KeystrokeBucket {
  ts_bucket: number;
  count: number;
}

export interface BrowserVisit {
  ts: number;
  url: string;
  page_title: string;
  browser: string;
  duration_s: number;
}

export interface ScreenshotMeta {
  client_uuid: string;
  ts: number;
  byte_size: number;
  width: number;
  height: number;
  display_id: number;
}

export interface ScreenshotsResponse {
  screenshots: ScreenshotMeta[];
  limit: number;
  offset: number;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}
