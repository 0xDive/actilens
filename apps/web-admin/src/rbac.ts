import type { BusinessRole } from "./api/types";

export function canViewReports(role: BusinessRole | undefined): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

export function canManageMembers(role: BusinessRole | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function canManageDevices(role: BusinessRole | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function canManageSettings(role: BusinessRole | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function canViewAudit(role: BusinessRole | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function canManageRoles(role: BusinessRole | undefined): boolean {
  return role === "owner";
}
