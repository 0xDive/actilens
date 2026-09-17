import { request } from "./client";
import { tokenStore } from "./tokenStore";
import {
  demoActivity,
  demoBrowser,
  demoBusinesses,
  demoEmployees,
  demoKeystrokes,
  demoRoster,
  demoScreenshots,
  isDemo,
} from "./demo";
import type {
  AccountType,
  ActivityResponse,
  AuditEvent,
  AuthResponse,
  BrowserVisit,
  Business,
  BusinessAccess,
  BusinessRole,
  BusinessSettingsPatch,
  CreateEmployeeResponse,
  Device,
  Employee,
  KeystrokeBucket,
  Membership,
  PrivacyAppCategory,
  PublicBusiness,
  ReportEmployee,
  ScreenshotsResponse,
  Tokens,
  User,
} from "./types";

// ---------- public ----------
export function listPublicBusinesses() {
  return request<{ businesses: PublicBusiness[] }>("/v1/public/businesses", {
    auth: false,
  });
}

// ---------- auth ----------
export async function login(identifier: string, password: string, business_id?: string) {
  const res = await request<AuthResponse>("/v1/auth/login", {
    method: "POST",
    auth: false,
    body: { identifier, password, business_id },
  });
  tokenStore.setSession(res.tokens, res.user);
  return res;
}

export async function register(
  identifier: string,
  password: string,
  display_name: string,
  account_type: AccountType = "manager",
) {
  const isEmail = identifier.includes("@");
  const res = await request<AuthResponse>("/v1/auth/register", {
    method: "POST",
    auth: false,
    body: {
      email: isEmail ? identifier : undefined,
      username: isEmail ? undefined : identifier.toLowerCase(),
      password,
      display_name,
      account_type,
    },
  });
  tokenStore.setSession(res.tokens, res.user);
  return res;
}

export function refresh(refresh_token: string) {
  return request<Tokens>("/v1/auth/refresh", {
    method: "POST",
    auth: false,
    body: { refresh_token },
  });
}

export function getMe() {
  return request<User>("/v1/me");
}

export function listMyMemberships() {
  return request<{ memberships: Membership[] }>("/v1/memberships/mine");
}

// ---------- businesses ----------
export function createBusiness(name: string) {
  return request<Business>("/v1/businesses", { method: "POST", body: { name } });
}

export function listMyBusinesses() {
  if (isDemo()) return Promise.resolve({ businesses: demoBusinesses });
  return request<{ businesses: Business[] }>("/v1/businesses/mine");
}

export function listConsoleBusinesses() {
  if (isDemo()) {
    return Promise.resolve({
      businesses: demoBusinesses.map((business) => ({ business, role: "owner" as BusinessRole })),
    });
  }
  return request<{ businesses: BusinessAccess[] }>("/v1/businesses/console");
}

export function updateMemberRole(businessId: string, userId: string, role: Exclude<BusinessRole, "owner">) {
  return request<{ status: string; role: BusinessRole }>(
    `/v1/businesses/${businessId}/members/${userId}/role`,
    { method: "PATCH", body: { role } },
  );
}

export function updateBusinessSettings(id: string, patch: BusinessSettingsPatch) {
  return request<{ status: string }>(`/v1/businesses/${id}/settings`, {
    method: "PATCH",
    body: patch,
  });
}

export function getPrivacyApps() {
  return request<{ categories: PrivacyAppCategory[] }>("/v1/public/screenshot-privacy-apps");
}

export function cleanupScreenshots(id: string, olderThanDays: number) {
  return request<{ deleted_count: number; bytes_freed: number }>(
    `/v1/businesses/${id}/screenshots/cleanup`,
    { method: "POST", query: { older_than_days: olderThanDays } },
  );
}

export function listAuditEvents(businessId: string, limit = 100) {
  return request<{ events: AuditEvent[] }>(`/v1/businesses/${businessId}/audit`, {
    query: { limit },
  });
}

// ---------- employees ----------
export function createEmployee(input: {
  email?: string;
  username?: string;
  password: string;
  display_name: string;
  business_id?: string;
}) {
  return request<CreateEmployeeResponse>("/v1/employees", {
    method: "POST",
    body: input,
  });
}

export function listBusinessEmployees(businessId: string) {
  if (isDemo()) return Promise.resolve({ employees: demoEmployees() });
  return request<{ employees: Employee[] }>(`/v1/businesses/${businessId}/employees`);
}

export function updateEmployee(id: string, patch: {
  email?: string;
  username?: string;
  display_name?: string;
  active?: boolean;
}) {
  return request<{ employee: Employee }>(`/v1/employees/${id}`, { method: "PATCH", body: patch });
}

export function resetEmployeePassword(id: string, password: string) {
  return request<{ status: string }>(`/v1/employees/${id}/reset-password`, {
    method: "POST", body: { password },
  });
}

export function archiveEmployee(id: string) {
  return request<{ status: string }>(`/v1/employees/${id}`, { method: "DELETE" });
}

export function listEmployeeDevices(employeeId: string) {
  return request<{ devices: Device[] }>(`/v1/employees/${employeeId}/devices`);
}

export function updateDevice(id: string, patch: { label?: string; revoked?: boolean }) {
  return request<{ device: Device }>(`/v1/devices/${id}`, {
    method: "PATCH",
    body: patch,
  });
}

// ---------- reports ----------
export function reportEmployees(businessId: string) {
  if (isDemo()) return Promise.resolve({ employees: demoRoster() });
  return request<{ employees: ReportEmployee[] }>("/v1/reports/employees", {
    query: { business_id: businessId },
  });
}

export function reportActivity(employeeId: string, from: number, to: number) {
  if (isDemo()) return Promise.resolve(demoActivity(employeeId));
  return request<ActivityResponse>(`/v1/reports/employees/${employeeId}/activity`, {
    query: { from, to },
  });
}

export function reportKeystrokes(employeeId: string, from: number, to: number) {
  if (isDemo()) return Promise.resolve(demoKeystrokes(employeeId));
  return request<{ buckets: KeystrokeBucket[] }>(
    `/v1/reports/employees/${employeeId}/keystrokes`,
    { query: { from, to } },
  );
}

export function reportBrowser(employeeId: string, from: number, to: number) {
  if (isDemo()) return Promise.resolve(demoBrowser(employeeId));
  return request<{ visits: BrowserVisit[] }>(`/v1/reports/employees/${employeeId}/browser`, {
    query: { from, to },
  });
}

export function reportScreenshots(
  employeeId: string,
  from: number,
  to: number,
  limit = 60,
  offset = 0,
) {
  if (isDemo()) return Promise.resolve(demoScreenshots(employeeId));
  return request<ScreenshotsResponse>(`/v1/reports/employees/${employeeId}/screenshots`, {
    query: { from, to, limit, offset },
  });
}
