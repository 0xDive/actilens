import { request } from "./client";

export interface EnrollmentTokenResponse {
  token: string;
  business_id: string;
  expires_at: string;
}

export function createEnrollmentToken(employeeId: string, expiresInHours = 24) {
  return request<EnrollmentTokenResponse>(`/v1/employees/${employeeId}/enrollment-token`, {
    method: "POST",
    body: { expires_in_hours: expiresInHours },
  });
}
