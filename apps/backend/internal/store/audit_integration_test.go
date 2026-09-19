package store

import (
	"context"
	"testing"
)

func TestIntegrationAuditV2SnapshotsChangesAndPagination(t *testing.T) {
	st, _ := integrationStore(t)
	ctx := context.Background()

	owner, err := st.CreateUser(
		ctx,
		"audit-v2-owner@example.test",
		"audit_v2_owner",
		"hash",
		"Audit Owner",
		"manager",
	)
	if err != nil {
		t.Fatalf("create owner: %v", err)
	}
	biz, err := st.CreateBusiness(ctx, owner.ID, "Audit V2 Team", "team")
	if err != nil {
		t.Fatalf("create business: %v", err)
	}
	member, _, err := st.CreateEmployee(
		ctx,
		owner.ID,
		&biz.ID,
		"audit-v2-member@example.test",
		"audit_v2_member",
		"hash",
		"Audit Member",
	)
	if err != nil {
		t.Fatalf("create member: %v", err)
	}

	if err := st.UpdateMembershipRole(
		ctx, owner.ID, biz.ID, member.ID, RoleManager,
	); err != nil {
		t.Fatalf("change member role: %v", err)
	}
	if err := st.UpdateMembershipMonitoring(
		ctx, owner.ID, biz.ID, member.ID, false,
	); err != nil {
		t.Fatalf("change member monitoring: %v", err)
	}

	nextInterval := biz.ScreenshotIntervalS + 30
	if err := st.UpdateBusinessSettingsAudited(
		ctx,
		owner.ID,
		biz.ID,
		map[string]any{"screenshot_interval_s": nextInterval},
	); err != nil {
		t.Fatalf("change screenshot interval: %v", err)
	}

	rolePage, err := st.ListAuditEventsPage(ctx, owner.ID, biz.ID, AuditQuery{
		Limit:  10,
		Action: "member.role_changed",
	})
	if err != nil {
		t.Fatalf("list role audit: %v", err)
	}
	if rolePage.Total != 1 || len(rolePage.Events) != 1 {
		t.Fatalf("role audit page = total:%d len:%d, want 1/1", rolePage.Total, len(rolePage.Events))
	}
	roleEvent := rolePage.Events[0]

	if got := roleEvent.Details["schema_version"]; got != float64(2) {
		t.Fatalf("schema_version = %#v, want 2", got)
	}

	actor, ok := roleEvent.Details["actor"].(map[string]any)
	if !ok {
		t.Fatalf("actor snapshot missing: %#v", roleEvent.Details["actor"])
	}
	if got := actor["display_name"]; got != "Audit Owner" {
		t.Fatalf("actor display_name = %#v, want Audit Owner", got)
	}

	target, ok := roleEvent.Details["target"].(map[string]any)
	if !ok {
		t.Fatalf("target snapshot missing: %#v", roleEvent.Details["target"])
	}
	if got := target["display_name"]; got != "Audit Member" {
		t.Fatalf("target display_name = %#v, want Audit Member", got)
	}
	if got := target["role"]; got != string(RoleManager) {
		t.Fatalf("target role = %#v, want %s", got, RoleManager)
	}

	changes, ok := roleEvent.Details["changes"].([]any)
	if !ok || len(changes) != 1 {
		t.Fatalf("role changes = %#v, want exactly one", roleEvent.Details["changes"])
	}
	change, ok := changes[0].(map[string]any)
	if !ok {
		t.Fatalf("role change payload = %#v", changes[0])
	}
	if change["field"] != "role" ||
		change["before"] != string(RoleEmployee) ||
		change["after"] != string(RoleManager) {
		t.Fatalf("role change = %#v, want employee -> manager", change)
	}

	searchPage, err := st.ListAuditEventsPage(ctx, owner.ID, biz.ID, AuditQuery{
		Limit:  10,
		Search: "Audit Member",
	})
	if err != nil {
		t.Fatalf("search audit by historical target name: %v", err)
	}
	if searchPage.Total < 2 {
		t.Fatalf("search total = %d, want multiple member events", searchPage.Total)
	}

	userPage, err := st.ListAuditEventsPage(ctx, owner.ID, biz.ID, AuditQuery{
		Limit:  10,
		UserID: member.ID,
	})
	if err != nil {
		t.Fatalf("filter audit by member: %v", err)
	}
	if userPage.Total < 2 {
		t.Fatalf("member filter total = %d, want multiple events", userPage.Total)
	}
	for _, event := range userPage.Events {
		if event.ActorUserID != member.ID && event.TargetID != member.ID {
			t.Fatalf("user filter leaked unrelated event: %+v", event)
		}
	}

	firstPage, err := st.ListAuditEventsPage(ctx, owner.ID, biz.ID, AuditQuery{
		Limit:  2,
		Offset: 0,
	})
	if err != nil {
		t.Fatalf("list first audit page: %v", err)
	}
	if firstPage.Total < 5 {
		t.Fatalf("audit total = %d, want at least five events", firstPage.Total)
	}
	if len(firstPage.Events) != 2 {
		t.Fatalf("first page len = %d, want 2", len(firstPage.Events))
	}

	secondPage, err := st.ListAuditEventsPage(ctx, owner.ID, biz.ID, AuditQuery{
		Limit:  2,
		Offset: 2,
	})
	if err != nil {
		t.Fatalf("list second audit page: %v", err)
	}
	if len(secondPage.Events) == 0 {
		t.Fatal("second audit page is empty")
	}
	for _, first := range firstPage.Events {
		for _, second := range secondPage.Events {
			if first.ID == second.ID {
				t.Fatalf("audit pagination duplicated event id %d", first.ID)
			}
		}
	}

	foundFacet := false
	for _, facet := range firstPage.Users {
		if facet.ID == member.ID && facet.Name == "Audit Member" {
			foundFacet = true
			break
		}
	}
	if !foundFacet {
		t.Fatalf("member audit facet missing from %#v", firstPage.Users)
	}

	settingsPage, err := st.ListAuditEventsPage(ctx, owner.ID, biz.ID, AuditQuery{
		Limit:  10,
		Action: "settings.screenshot_changed",
	})
	if err != nil {
		t.Fatalf("list settings audit: %v", err)
	}
	if settingsPage.Total != 1 || len(settingsPage.Events) != 1 {
		t.Fatalf("settings audit page = total:%d len:%d, want 1/1", settingsPage.Total, len(settingsPage.Events))
	}
	settingsChanges, ok := settingsPage.Events[0].Details["changes"].([]any)
	if !ok || len(settingsChanges) != 1 {
		t.Fatalf("settings changes = %#v", settingsPage.Events[0].Details["changes"])
	}
	settingsChange := settingsChanges[0].(map[string]any)
	if settingsChange["field"] != "screenshot_interval_s" ||
		settingsChange["before"] != float64(biz.ScreenshotIntervalS) ||
		settingsChange["after"] != float64(nextInterval) {
		t.Fatalf("settings change = %#v, want %d -> %d", settingsChange, biz.ScreenshotIntervalS, nextInterval)
	}
}
