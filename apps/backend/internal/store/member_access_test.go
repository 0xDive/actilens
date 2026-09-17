package store

import "testing"

func TestRoleMayManageTarget(t *testing.T) {
	tests := []struct {
		name       string
		actor      BusinessRole
		target     BusinessRole
		permission BusinessPermission
		want       bool
	}{
		{"owner manages admin account", RoleOwner, RoleAdmin, PermissionManageEmployees, true},
		{"owner manages employee device", RoleOwner, RoleEmployee, PermissionManageDevices, true},
		{"admin manages manager", RoleAdmin, RoleManager, PermissionManageEmployees, true},
		{"admin manages employee", RoleAdmin, RoleEmployee, PermissionManageEmployees, true},
		{"admin cannot manage peer admin", RoleAdmin, RoleAdmin, PermissionManageEmployees, false},
		{"admin cannot manage owner", RoleAdmin, RoleOwner, PermissionManageEmployees, false},
		{"admin cannot revoke peer admin device", RoleAdmin, RoleAdmin, PermissionManageDevices, false},
		{"manager cannot manage employee", RoleManager, RoleEmployee, PermissionManageEmployees, false},
		{"manager can read reports", RoleManager, RoleOwner, PermissionReports, true},
		{"employee cannot read reports", RoleEmployee, RoleEmployee, PermissionReports, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := roleMayManageTarget(tt.actor, tt.target, tt.permission); got != tt.want {
				t.Fatalf("roleMayManageTarget(%q, %q, %q) = %v, want %v", tt.actor, tt.target, tt.permission, got, tt.want)
			}
		})
	}
}
