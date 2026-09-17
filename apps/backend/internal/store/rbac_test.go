package store

import "testing"

func TestRoleAllows(t *testing.T) {
	tests := []struct {
		name string
		role BusinessRole
		permission BusinessPermission
		want bool
	}{
		{"owner reports", RoleOwner, PermissionReports, true},
		{"owner roles", RoleOwner, PermissionManageRoles, true},
		{"admin reports", RoleAdmin, PermissionReports, true},
		{"admin employees", RoleAdmin, PermissionManageEmployees, true},
		{"admin settings", RoleAdmin, PermissionSettings, true},
		{"admin cannot assign roles", RoleAdmin, PermissionManageRoles, false},
		{"manager reports", RoleManager, PermissionReports, true},
		{"manager cannot manage employees", RoleManager, PermissionManageEmployees, false},
		{"manager cannot view audit", RoleManager, PermissionAudit, false},
		{"employee cannot reports", RoleEmployee, PermissionReports, false},
		{"employee cannot settings", RoleEmployee, PermissionSettings, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := roleAllows(tt.role, tt.permission); got != tt.want {
				t.Fatalf("roleAllows(%q, %q) = %v, want %v", tt.role, tt.permission, got, tt.want)
			}
		})
	}
}

func TestValidBusinessRole(t *testing.T) {
	for _, role := range []BusinessRole{RoleOwner, RoleAdmin, RoleManager, RoleEmployee} {
		if !ValidBusinessRole(role) {
			t.Fatalf("expected %q to be valid", role)
		}
	}
	if ValidBusinessRole("superadmin") {
		t.Fatal("unexpected custom role accepted")
	}
}
