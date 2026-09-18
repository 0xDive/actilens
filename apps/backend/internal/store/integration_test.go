package store

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"actilens/backend/internal/db"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

const integrationDatabaseEnv = "ACTILENS_TEST_DATABASE_URL"

func integrationStore(t *testing.T) (*Store, *pgxpool.Pool) {
	t.Helper()

	dsn := os.Getenv(integrationDatabaseEnv)
	if dsn == "" {
		t.Skipf("%s is not set", integrationDatabaseEnv)
	}
	if err := db.Migrate(dsn); err != nil {
		t.Fatalf("migrate integration database: %v", err)
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("connect integration database: %v", err)
	}
	t.Cleanup(pool.Close)

	_, err = pool.Exec(ctx, `
		TRUNCATE TABLE
			enrollment_tokens,
			audit_events,
			screenshots,
			browser_visits,
			keystroke_buckets,
			activity_samples,
			devices,
			memberships,
			businesses,
			users
		RESTART IDENTITY CASCADE`)
	if err != nil {
		t.Fatalf("reset integration database: %v", err)
	}

	return New(pool), pool
}

func TestIntegrationManagedMemberLifecycle(t *testing.T) {
	st, pool := integrationStore(t)
	ctx := context.Background()

	owner, err := st.CreateUser(ctx, "owner@example.test", "", "hash", "Owner", "manager")
	if err != nil {
		t.Fatalf("create owner: %v", err)
	}
	biz, err := st.CreateBusiness(ctx, owner.ID, "Primary team", "team")
	if err != nil {
		t.Fatalf("create business: %v", err)
	}

	consoleBusinesses, err := st.ListBusinessesForConsole(ctx, owner.ID)
	if err != nil {
		t.Fatalf("list console businesses: %v", err)
	}
	if len(consoleBusinesses) != 1 || consoleBusinesses[0].Business.ID != biz.ID || consoleBusinesses[0].Role != RoleOwner {
		t.Fatalf("unexpected console businesses: %+v", consoleBusinesses)
	}
	employee, _, err := st.CreateEmployee(ctx, owner.ID, &biz.ID, "", "alice", "hash", "Alice")
	if err != nil {
		t.Fatalf("create employee: %v", err)
	}

	if _, err := st.CreateEnrollmentToken(ctx, owner.ID, biz.ID, employee.ID, "token-hash-1", time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("create enrollment token: %v", err)
	}
	grant, err := st.RedeemEnrollmentToken(ctx, "token-hash-1")
	if err != nil {
		t.Fatalf("redeem enrollment token: %v", err)
	}
	if grant.User.ID != employee.ID || grant.BusinessID != biz.ID || grant.AuthVersion != 1 {
		t.Fatalf("unexpected enrollment grant: %+v", grant)
	}
	if _, err := st.RedeemEnrollmentToken(ctx, "token-hash-1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("second enrollment redemption = %v, want ErrNotFound", err)
	}
	if _, err := st.CreateEnrollmentToken(ctx, owner.ID, biz.ID, employee.ID, "token-hash-2", time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("create replacement enrollment token: %v", err)
	}

	deviceID := uuid.NewString()
	activityID := uuid.NewString()
	keystrokeID := uuid.NewString()
	browserID := uuid.NewString()
	if err := st.SyncBatch(ctx, employee.ID, biz.ID, deviceID, DeviceMetadata{},
		[]ActivityRow{{ClientUUID: activityID, Ts: 100, AppName: "Editor", DurationS: 10, ClientUpdatedAt: 100}},
		[]KeystrokeRow{{ClientUUID: keystrokeID, TsBucket: 60, Count: 7, ClientUpdatedAt: 100}},
		[]BrowserRow{{ClientUUID: browserID, Ts: 100, URL: "https://example.test", DurationS: 10, ClientUpdatedAt: 100}},
	); err != nil {
		t.Fatalf("sync member data: %v", err)
	}
	if err := st.UpsertScreenshot(ctx, employee.ID, biz.ID, ScreenshotRow{
		ClientUUID:      uuid.NewString(),
		DeviceID:        deviceID,
		Ts:              100,
		FilePath:        "screenshots/example.webp",
		ByteSize:        42,
		ClientUpdatedAt: 100,
	}); err != nil {
		t.Fatalf("insert screenshot metadata: %v", err)
	}

	devices, err := st.ListEmployeeDevices(ctx, owner.ID, employee.ID, biz.ID)
	if err != nil {
		t.Fatalf("list employee devices in business: %v", err)
	}
	if len(devices) != 1 || devices[0].ID != deviceID {
		t.Fatalf("unexpected employee devices: %+v", devices)
	}

	admin, err := st.CreateUser(ctx, "admin@example.test", "", "hash", "Admin", "manager")
	if err != nil {
		t.Fatalf("create admin: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO memberships (user_id, business_id, role) VALUES ($1, $2, 'admin')`,
		admin.ID, biz.ID); err != nil {
		t.Fatalf("add admin membership: %v", err)
	}
	if _, err := st.ListEmployeeDevices(ctx, admin.ID, employee.ID, biz.ID); err != nil {
		t.Fatalf("admin list employee devices in business: %v", err)
	}

	otherBiz, err := st.CreateBusiness(ctx, admin.ID, "Other team", "team")
	if err != nil {
		t.Fatalf("create unrelated business: %v", err)
	}
	if _, err := st.ListEmployeeDevices(ctx, admin.ID, employee.ID, otherBiz.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("list devices through unrelated business = %v, want ErrNotFound", err)
	}

	label := "Work laptop"
	updatedDevice, err := st.UpdateDevice(ctx, owner.ID, deviceID, &label, nil, biz.ID)
	if err != nil {
		t.Fatalf("rename device in business: %v", err)
	}
	if updatedDevice.Label != label {
		t.Fatalf("renamed device label = %q, want %q", updatedDevice.Label, label)
	}

	if err := st.UpdateMembershipMonitoring(ctx, owner.ID, biz.ID, employee.ID, false); err != nil {
		t.Fatalf("disable monitoring: %v", err)
	}
	if err := st.SyncBatch(ctx, employee.ID, biz.ID, deviceID, DeviceMetadata{}, nil, nil, nil); !errors.Is(err, ErrMembershipUnavailable) {
		t.Fatalf("sync while monitoring disabled = %v, want ErrMembershipUnavailable", err)
	}
	if err := st.UpdateMembershipMonitoring(ctx, owner.ID, biz.ID, employee.ID, true); err != nil {
		t.Fatalf("re-enable monitoring: %v", err)
	}

	removedFiles := false
	result, err := st.PurgeMemberFromBusiness(ctx, owner.ID, biz.ID, employee.ID, func() error {
		removedFiles = true
		return nil
	})
	if err != nil {
		t.Fatalf("purge member: %v", err)
	}
	if !removedFiles {
		t.Fatal("purge did not invoke screenshot tree removal")
	}
	if result.ActivityDeleted != 1 || result.KeystrokesDeleted != 1 || result.BrowserDeleted != 1 || result.ScreenshotsDeleted != 1 {
		t.Fatalf("unexpected purge counts: %+v", result)
	}
	if result.EnrollmentsDeleted != 2 || result.BytesFreed != 42 || !result.AccountTombstoned {
		t.Fatalf("unexpected purge metadata: %+v", result)
	}

	member, err := st.MemberBelongsToBusiness(ctx, employee.ID, biz.ID)
	if err != nil {
		t.Fatalf("check membership after purge: %v", err)
	}
	if member {
		t.Fatal("purged employee still belongs to business")
	}
	active, version, err := st.UserSecurity(ctx, employee.ID)
	if err != nil {
		t.Fatalf("load purged user security: %v", err)
	}
	if active || version <= 1 {
		t.Fatalf("purged account security = active:%v version:%d, want inactive and bumped version", active, version)
	}
	if err := st.SyncBatch(ctx, employee.ID, biz.ID, deviceID, DeviceMetadata{}, nil, nil, nil); !errors.Is(err, ErrMembershipUnavailable) {
		t.Fatalf("sync after purge = %v, want ErrMembershipUnavailable", err)
	}

	for _, table := range []string{"activity_samples", "keystroke_buckets", "browser_visits", "screenshots", "enrollment_tokens", "devices"} {
		var count int
		if err := pool.QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&count); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		if count != 0 {
			t.Fatalf("%s has %d rows after purge, want 0", table, count)
		}
	}

	events, err := st.ListAuditEvents(ctx, owner.ID, biz.ID, 100)
	if err != nil {
		t.Fatalf("list audit events: %v", err)
	}
	foundPurge := false
	for _, event := range events {
		if event.Action == "member.purged" && event.TargetID == employee.ID {
			foundPurge = true
			break
		}
	}
	if !foundPurge {
		t.Fatal("member.purged audit event was not retained")
	}
}

func TestIntegrationPurgeIsOrganizationScoped(t *testing.T) {
	st, pool := integrationStore(t)
	ctx := context.Background()

	ownerA, err := st.CreateUser(ctx, "owner-a@example.test", "", "hash", "Owner A", "manager")
	if err != nil {
		t.Fatalf("create owner A: %v", err)
	}
	ownerB, err := st.CreateUser(ctx, "owner-b@example.test", "", "hash", "Owner B", "manager")
	if err != nil {
		t.Fatalf("create owner B: %v", err)
	}
	bizA, err := st.CreateBusiness(ctx, ownerA.ID, "Team A", "team")
	if err != nil {
		t.Fatalf("create business A: %v", err)
	}
	bizB, err := st.CreateBusiness(ctx, ownerB.ID, "Team B", "team")
	if err != nil {
		t.Fatalf("create business B: %v", err)
	}
	employee, _, err := st.CreateEmployee(ctx, ownerA.ID, &bizA.ID, "", "shared-member", "hash", "Shared Member")
	if err != nil {
		t.Fatalf("create shared employee: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO memberships (user_id, business_id, role) VALUES ($1, $2, 'employee')`,
		employee.ID, bizB.ID); err != nil {
		t.Fatalf("add second organization membership: %v", err)
	}

	deviceID := uuid.NewString()
	if err := st.SyncBatch(ctx, employee.ID, bizA.ID, deviceID, DeviceMetadata{},
		[]ActivityRow{{ClientUUID: uuid.NewString(), Ts: 100, AppName: "A", DurationS: 1, ClientUpdatedAt: 100}}, nil, nil); err != nil {
		t.Fatalf("sync business A: %v", err)
	}
	if err := st.SyncBatch(ctx, employee.ID, bizB.ID, deviceID, DeviceMetadata{},
		[]ActivityRow{{ClientUUID: uuid.NewString(), Ts: 200, AppName: "B", DurationS: 1, ClientUpdatedAt: 200}}, nil, nil); err != nil {
		t.Fatalf("sync business B: %v", err)
	}

	result, err := st.PurgeMemberFromBusiness(ctx, ownerA.ID, bizA.ID, employee.ID, nil)
	if err != nil {
		t.Fatalf("purge from business A: %v", err)
	}
	if result.AccountTombstoned {
		t.Fatal("shared account was tombstoned despite remaining organization access")
	}

	memberA, err := st.MemberBelongsToBusiness(ctx, employee.ID, bizA.ID)
	if err != nil {
		t.Fatalf("check business A membership: %v", err)
	}
	memberB, err := st.MemberBelongsToBusiness(ctx, employee.ID, bizB.ID)
	if err != nil {
		t.Fatalf("check business B membership: %v", err)
	}
	if memberA || !memberB {
		t.Fatalf("membership scope after purge = A:%v B:%v, want A:false B:true", memberA, memberB)
	}

	active, version, err := st.UserSecurity(ctx, employee.ID)
	if err != nil {
		t.Fatalf("load shared user security: %v", err)
	}
	if !active || version <= 1 {
		t.Fatalf("shared account security = active:%v version:%d, want active and bumped version", active, version)
	}

	var countA, countB int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM activity_samples WHERE business_id = $1`, bizA.ID).Scan(&countA); err != nil {
		t.Fatalf("count business A activity: %v", err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM activity_samples WHERE business_id = $1`, bizB.ID).Scan(&countB); err != nil {
		t.Fatalf("count business B activity: %v", err)
	}
	if countA != 0 || countB != 1 {
		t.Fatalf("activity scope after purge = A:%d B:%d, want A:0 B:1", countA, countB)
	}

	var devices int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM devices WHERE user_id = $1`, employee.ID).Scan(&devices); err != nil {
		t.Fatalf("count shared user devices: %v", err)
	}
	if devices != 1 {
		t.Fatalf("shared user devices = %d, want 1", devices)
	}
}
