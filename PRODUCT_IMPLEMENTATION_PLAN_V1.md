# ActiLens Product Implementation Plan v1

Status: **implementation proposal derived from PRODUCT_FOUNDATION_SPEC_V1.md**  
Purpose: turn the approved product model into complete vertical product capabilities.

---

## 1. Delivery rule

ActiLens must stop shipping partial features.

A capability is considered complete only when all applicable layers are finished:

```text
schema/migration
→ store/domain logic
→ permission checks
→ API contract
→ stable error codes
→ audit event
→ web UI
→ desktop behavior (when applicable)
→ RU/EN copy
→ loading/empty/error/conflict states
→ integration tests
→ migration/upgrade tests
→ documentation
```

No UI-only setting may be merged if the backend semantics are still undefined.
No backend column may be considered a product feature until the corresponding UX and
failure cases exist.

Feature branches should therefore be organized around vertical capabilities, not
frontend/backend folders.

---

## 2. Target domain model

## 2.1 users

Users are global identities and may belong to multiple organizations.

Target responsibilities:

```text
id
email nullable
username nullable
display_name
password_hash
global_active
auth_version
account_type          onboarding hint only
created_at
updated_at
```

Rules:

- username and email may coexist;
- at least one login identifier must exist for server-managed accounts;
- `account_type` is not authoritative for organization behavior;
- organization blocking/removal does not flip the global account inactive;
- global inactive is reserved for true account-level security/deletion state.

Database constraints:

- case-insensitive unique normalized email when non-null;
- case-insensitive unique normalized username when non-null;
- check that username/email presence follows supported auth rules.

## 2.2 businesses / organizations

Keep the existing table name if migration cost favors it, but treat it as the
Organization aggregate in product/domain code.

Target fields:

```text
id
name
kind                         team | family | other
owner_user_id
timezone                     IANA timezone string
week_starts_on               null = locale/auto, 0..6 explicit override

default_member_monitoring_enabled

collect_app_activity
collect_window_titles
collect_screenshots
collect_browser_activity
collect_keystroke_counts

screenshot_interval_s
screenshot_capture_scope     active_window | active_display | all_displays
screenshot_retention_days

activity_retention_days
browser_retention_days
keystroke_retention_days
audit_retention_days         null = indefinite

idle_threshold_s
device_limit                 null = unlimited
enrollment_token_ttl_s

archived_at                  nullable
deletion_scheduled_at        nullable

created_at
updated_at
```

Existing `allow_employee_override` should be migrated toward managed-mode behavior
where organization-controlled users cannot override collection policy. Keep backward
compatibility only while old desktop agents exist.

Existing `screenshot_mode` should not remain the final conceptual model. Migrate it
to:

- `collect_screenshots`;
- `screenshot_capture_scope`;
- privacy rules.

Suggested mapping for existing installations:

```text
old privacy  -> collect_screenshots=true, capture_scope=active_window
old normal   -> collect_screenshots=true, capture_scope=active_display
```

Do not change historical screenshots during this migration.

Default retention for existing/new organizations:

```text
activity     180 days
screenshots   30 days
browser       90 days
keystrokes    90 days
audit         indefinite
```

Existing configured screenshot retention is preserved.

## 2.3 memberships

Membership becomes the authoritative organization-scoped lifecycle object.

Target fields:

```text
user_id
business_id
role                    owner | admin | manager | employee
status                  active | blocked | removed
monitoring_enabled
blocked_at
removed_at
created_at
updated_at
```

Rules:

- one membership per user/business;
- Owner membership is always active while organization is operational;
- blocked is reversible;
- removed remains in the table so Former members/history can be addressed safely;
- restore sets role to Employee and explicitly chooses monitoring state;
- permanent purge is the only operation that physically removes the organization
  membership/data relationship.

Do not use `users.active` to implement organization blocking.

## 2.4 role capabilities

The UI keeps four fixed roles.

Backend defines capabilities centrally:

```text
reports.view
members.view
members.manage
members.purge
devices.view
devices.manage
settings.view
settings.manage
audit.view
roles.manage
organization.manage
organization.transfer
organization.delete
```

Initial mapping:

```text
Owner:
  all capabilities

Admin:
  reports.view
  members.view
  members.manage
  devices.view
  devices.manage
  settings.view
  settings.manage
  audit.view
  organization.manage

Manager:
  reports.view
  members.view

Employee:
  no admin-console capabilities
```

Additional target restrictions remain separate from capability presence:

- Admin cannot mutate Owner;
- Admin cannot mutate peer Admin where policy forbids it;
- only Owner has `members.purge`;
- only Owner has role/transfer/delete capabilities.

One authorization service/helper must own this logic. Handlers must not introduce new
raw `role == ...` authorization checks.

## 2.5 devices

Target fields:

```text
id
user_id
business_id
label
hostname
platform
arch
app_version
first_seen_at
last_seen_at
revoked_at
created_at / updated_at where useful
```

Critical invariant:

**one managed device belongs to one organization.**

Enrollment assigns `business_id`.

Moving an installation to another organization requires unenroll/re-enroll.

Device-limit rules:

- active/non-revoked devices consume slots;
- revoked devices do not;
- enrollment checks the limit atomically;
- restore checks the limit atomically;
- limit error code: `device_limit_reached`.

### Existing-device migration

Existing devices do not currently have authoritative organization binding.

Backfill algorithm:

1. For each device, inspect organization-scoped activity/screenshot/sync evidence for
   the owning user.
2. If exactly one organization is represented, bind the device to it.
3. If the user has exactly one active membership and no conflicting evidence, bind
   to that organization.
4. If binding is ambiguous, leave temporarily unbound and mark migration state
   requiring re-enrollment rather than guessing.
5. Old clients/endpoints remain compatible during the migration window.
6. New enrollment always creates an explicitly bound device.

Never bind a device to an arbitrary "first membership".

## 2.6 screenshots

Add:

```text
capture_group_id nullable UUID
```

For all-displays capture:

- one screenshot row/file per display;
- all rows from one capture moment share `capture_group_id`;
- existing screenshots simply have null group id.

## 2.7 privacy rules

Replace the long-term array-only privacy representation with an organization-scoped
rule model.

Suggested table:

```text
privacy_rules
  id
  business_id
  kind             app | window_title
  match_type       exact | contains
  pattern
  enabled
  created_at
  updated_at
```

Initial behavior:

- case-insensitive matching;
- app: exact + contains;
- window title: contains;
- match is evaluated on the client before screenshot creation;
- a matched screenshot is never captured/uploaded.

During migration, existing `screenshot_skip_apps` can be converted to enabled app
rules.

## 2.8 auth sessions

Server needs first-class sessions rather than refresh credentials being opaque to
product UX.

Target session model:

```text
id
user_id
refresh_token_hash / session secret hash
client_type             web | desktop
client_label            browser/device description
created_at
last_used_at
expires_at
revoked_at
auth_version_at_issue
```

Never expose token material.

Session UI exposes:

- client type;
- client description;
- created;
- last used;
- current session;
- revoke;
- revoke all others.

No IP display in v1.

## 2.9 MFA

Suggested tables:

```text
user_mfa
  user_id
  totp_secret_encrypted
  enabled_at
  created_at
  updated_at

mfa_recovery_codes
  id
  user_id
  code_hash
  used_at
  created_at
```

Rules:

- TOTP only for first version;
- secret encrypted at rest using server secret/key material, never plaintext DB value;
- 10 recovery codes;
- store recovery-code hashes only;
- show codes once;
- regeneration invalidates previous codes;
- MFA reset revokes sessions and is audited.

Critical-operation re-auth creates a short-lived server-side reauthentication grant or
signed challenge rather than passing a password/MFA code repeatedly between unrelated
endpoints.

## 2.10 audit

Audit remains organization-scoped for organization changes and security-scoped where
appropriate.

Event payloads store non-secret old/new values.

Never audit:

- passwords;
- TOTP secret;
- recovery code values;
- refresh/access tokens;
- enrollment-token value;
- screenshot/browser content.

---

## 3. Canonical API direction

During migration keep old endpoints where clients require compatibility, but all new
product work should follow explicit resource scope.

### Organization identity/settings

```text
GET   /v1/businesses/:business_id
PATCH /v1/businesses/:business_id

GET   /v1/businesses/:business_id/settings
PATCH /v1/businesses/:business_id/settings
```

Organization identity patch supports:

```json
{
  "name": "...",
  "kind": "team",
  "timezone": "Europe/Berlin",
  "week_starts_on": 1
}
```

Settings patch covers operational policy, not organization identity.

### Members

```text
GET  /v1/businesses/:business_id/members?status=active
GET  /v1/businesses/:business_id/members?status=removed

POST /v1/businesses/:business_id/members/:user_id/block
POST /v1/businesses/:business_id/members/:user_id/unblock
POST /v1/businesses/:business_id/members/:user_id/remove
POST /v1/businesses/:business_id/members/:user_id/restore
POST /v1/businesses/:business_id/members/:user_id/purge

PATCH /v1/businesses/:business_id/members/:user_id/role
PATCH /v1/businesses/:business_id/members/:user_id/monitoring
```

Restore body:

```json
{
  "monitoring_enabled": true
}
```

Role is reset to Employee by the restore operation.

### Devices

Canonical:

```text
GET   /v1/businesses/:business_id/members/:user_id/devices
PATCH /v1/businesses/:business_id/devices/:device_id
```

The query-param form introduced as an RBAC hotfix can remain temporarily but should
not be the final endpoint shape.

### Organization lifecycle

```text
POST /v1/businesses/:business_id/archive
POST /v1/businesses/:business_id/restore

POST /v1/businesses/:business_id/transfer-ownership

GET  /v1/businesses/:business_id/deletion-preview
POST /v1/businesses/:business_id/schedule-deletion
POST /v1/businesses/:business_id/cancel-deletion
```

Schedule deletion requires fresh re-auth and MFA challenge if enabled.

### Account identity/security

```text
GET   /v1/account
PATCH /v1/account/login-identifiers
POST  /v1/account/password/change

GET    /v1/account/sessions
DELETE /v1/account/sessions/:session_id
POST   /v1/account/sessions/revoke-others

POST /v1/account/mfa/totp/setup
POST /v1/account/mfa/totp/confirm
POST /v1/account/mfa/challenge
POST /v1/account/mfa/recovery/regenerate
POST /v1/businesses/:business_id/members/:user_id/mfa/reset
```

No managed-user self-delete endpoint is exposed in v1.

### Retention and cleanup

```text
POST /v1/businesses/:business_id/retention/preview
POST /v1/businesses/:business_id/retention/apply

POST /v1/businesses/:business_id/cleanup/preview
POST /v1/businesses/:business_id/cleanup/run
```

Preview and execution use the same normalized request payload plus a preview token/hash
where useful to prevent confirming a different operation than the one previewed.

### Export

```text
POST /v1/businesses/:business_id/exports
GET  /v1/businesses/:business_id/exports/:export_id
GET  /v1/businesses/:business_id/exports/:export_id/download
```

Large exports should be job-based rather than held in one HTTP request.

---

## 4. Stable API errors

Target response shape:

```json
{
  "error": {
    "code": "permission_denied",
    "details": {}
  }
}
```

During compatibility migration, a fallback human-readable string may be included, but
frontend logic keys off `code`, not English server text.

Initial code vocabulary:

```text
validation_error
authentication_required
reauth_required
mfa_required
permission_denied
not_found
conflict
member_blocked
member_removed
organization_archived
organization_deletion_pending
device_limit_reached
device_revoked
identifier_taken
session_revoked
rate_limited
internal_error
```

Web/Desktop own localized RU/EN copy.

---

## 5. Audit convention

Every mutation goes through a domain/store path that can atomically write its audit
event when organization-scoped.

Event families:

```text
organization.renamed
organization.kind_changed
organization.timezone_changed
organization.week_start_changed
organization.archived
organization.restored
organization.owner_transferred
organization.deletion_scheduled
organization.deletion_cancelled
organization.deleted

member.blocked
member.unblocked
member.removed
member.restored
member.purged
member.role_changed
member.monitoring_changed
member.login_changed
member.mfa_reset

device.updated
device.revoked
device.restored
device.enrolled

settings.collection_changed
settings.screenshot_changed
settings.retention_changed
settings.enrollment_changed
settings.device_limit_changed

security.password_changed
security.sessions_revoked
security.mfa_enabled
security.mfa_disabled
security.recovery_codes_regenerated
```

For bulk operations, audit one parent event plus summarized counts rather than flooding
thousands of near-identical events unless per-member audit is needed for traceability.

---

## 6. Milestone 1 — Organization Core + RBAC Foundation + Account Security

This is the approved first implementation block.

It is finished only when all items below are delivered together.

### 6.1 Schema/domain

- organization timezone/week-start;
- extensible kind validation including `other`;
- centralized capabilities;
- stable error representation;
- first-class sessions;
- username + email coexistence;
- auth-version invalidation helpers;
- MFA tables/foundation;
- organization audit helpers.

### 6.2 Organization product features

- rename organization — Owner/Admin;
- change kind — Owner only, confirmed, no data reset;
- timezone;
- week-start auto/override;
- read current organization metadata.

### 6.3 Account/security product features

- Owner changes own display name;
- Owner/Admin changes managed-member display name;
- self login identifier change with current password;
- admin-managed member username/email change;
- password change;
- all-session invalidation after password change;
- session list/revoke/revoke-others;
- TOTP setup/confirm/disable;
- recovery codes;
- organization-authorized MFA reset;
- critical re-auth challenge infrastructure.

### 6.4 UI

Settings gains completed sections:

```text
Organization
  Name
  Type
  Timezone
  Week start

Account
  Profile
  Login identifiers
  Password
  Sessions
  Two-factor authentication
```

Member account dialog gains managed identity editing with correct permission checks.

### 6.5 Security behavior

- password change forces login again;
- login-identifier change invalidates sessions;
- Admin demotion/session invalidation helper exists for later lifecycle use;
- MFA secret/codes never leak to audit/logs.

### 6.6 Tests

Must include:

- owner/admin rename matrix;
- admin cannot change organization kind;
- kind change preserves existing settings/data;
- timezone changes grouping configuration, not raw timestamps;
- username/email uniqueness;
- password change revokes all sessions;
- session revoke behavior;
- MFA happy path + invalid code + recovery code one-time use;
- MFA reset permission matrix;
- API stable error codes;
- old production DB migration.

No Milestone 2 work starts before Milestone 1 is green and manually accepted.

---

## 7. Milestone 2 — Membership lifecycle

### Schema

Add membership status/timestamps without losing current memberships.

Backfill every existing membership to:

```text
status = active
```

### Finished product capability

- Active members;
- Block;
- Unblock;
- Remove from organization;
- Former members page;
- Restore as Employee;
- choose monitoring state on restore;
- Owner-only permanent purge.

### Required semantics

Blocked:

- historical data preserved;
- organization sync rejected;
- account can still authenticate and shows organization suspended state;
- other organization memberships unaffected.

Removed:

- no organization access/sync;
- membership retained as removed;
- Owner/Admin historical reports remain;
- Manager does not see former members.

Restore:

- same user id;
- same historical data;
- role Employee;
- explicit monitoring choice.

### Tests

Full matrix with users belonging to two organizations is mandatory.

---

## 8. Milestone 3 — Organization-bound devices + enrollment

### Schema

- add `devices.business_id`;
- backfill safely;
- ambiguous devices require re-enrollment rather than guessed binding;
- add organization device limit;
- add default enrollment TTL.

### Product

- organization-scoped device API;
- automatic valid enrollment;
- configured active-device limit/unlimited;
- revoke frees slot;
- restore respects slot limit;
- device version health;
- employee warning for outdated device;
- Dashboard aggregate outdated count;
- explicit unenroll/re-enroll path.

### Desktop

Managed desktop stores authoritative organization binding received from enrollment.

Local-only history is never automatically uploaded when enrollment occurs.

---

## 9. Milestone 4 — Collection policy completeness

### Organization policy

Managed core:

- active/idle mandatory.

Optional:

- app names;
- window titles;
- screenshots;
- browser;
- keystroke counts.

New-member default monitoring setting is implemented.

Changing the default asks:

```text
Only future members
Apply to existing members
```

Bulk application previews affected count and is audited.

### Desktop enforcement

Managed mode:

- employee cannot pause organization monitoring;
- employee cannot alter managed collection switches;
- desktop clearly displays managed state/policy;
- disabled window titles are never transmitted;
- disabled categories are not transmitted.

Local-only mode keeps local controls.

### Compatibility

Backend must safely handle old agents that do not understand new fields.
Agent-version visibility helps admins identify installations that need upgrading.

---

## 10. Milestone 5 — Screenshots and privacy

### Capture

- screenshot enabled/disabled;
- scope:
  - active window;
  - active display;
  - all displays;
- interval;
- grouped multi-display captures via `capture_group_id`.

### Privacy rules

- organization privacy-rule table;
- app exact/contains;
- window title contains;
- case-insensitive;
- client evaluates before capture;
- matching screenshot never exists.

### Migration

Existing skip-app arrays are converted to equivalent privacy rules.

No existing screenshot file is modified/deleted by migration.

---

## 11. Milestone 6 — Retention + cleanup + export

### Retention

Independent policy:

- activity 180d;
- screenshots 30d;
- browser 90d;
- keystroke counts 90d;
- audit indefinite.

Increasing retention is safe immediate save.

Reducing retention:

1. preview;
2. exact affected counts/bytes where possible;
3. explicit confirmation;
4. audited policy change;
5. retention worker performs deletion.

### Cleanup

Unified cleanup supports:

- data classes;
- date range;
- preview;
- execution;
- audit.

### Export

- CSV/JSON structured exports;
- screenshot archive + manifest;
- full organization export job.

Before organization deletion UI offers full export, but user may decline.

---

## 12. Milestone 7 — Organization lifecycle

Only after the previous foundations exist.

### Ownership transfer

- Owner only;
- target active Admin;
- fresh password re-auth;
- MFA challenge if enabled;
- transactional role/owner change;
- previous Owner becomes Admin;
- sessions for both revoked;
- audit.

### Archive

Immediately:

- stop sync/collection;
- stop enrollment;
- read-only history;
- export/audit/former members available.

Restore:

- immediately returns organization to prior operational settings.

### Delete

1. archive;
2. deletion preview;
3. offer export;
4. password re-auth;
5. MFA if enabled;
6. typed organization-name confirmation;
7. schedule +7 days;
8. read-only/no monitoring during grace period;
9. cancel supported;
10. hard-delete after deadline.

Managed accounts whose last membership disappears are deleted as part of final cleanup.
Multi-org identities survive with remaining memberships.

---

## 13. Notification foundation

Do not build a notification center in the first milestones.

When domain events are introduced, keep an internal event interface so future delivery
can subscribe to events such as:

- device outdated;
- device offline;
- organization deletion pending;
- ownership transfer;
- security/MFA changes.

Do not block current implementation on SMTP or external notification delivery.

---

## 14. Migration strategy for existing production

Every schema milestone must support the live installation that already contains real
users/activity/screenshots/devices.

Rules:

1. migrations are additive first;
2. backfill with explicit deterministic rules;
3. deploy code that understands old+new shape where necessary;
4. verify production data;
5. only later remove deprecated columns/compatibility;
6. never require wiping volumes.

Before every destructive migration:

- `actilensctl.sh backup`;
- DB dump;
- app storage/config backup;
- migration smoke test on restored copy where possible.

CI must eventually include an **old-schema → current-schema** integration fixture, not
only fresh-database migration tests.

---

## 15. Deprecated concepts to remove gradually

After clients are migrated:

- inferred organization selection for scoped APIs;
- global-user active flag as organization block state;
- final reliance on `allow_employee_override` for managed users;
- mutually-exclusive username/email assumptions;
- `screenshot_mode` as the only screenshot-policy abstraction;
- array-only privacy exclusions;
- device records without organization binding;
- raw English API errors consumed directly by UI.

Deprecation is done only after current server + desktop compatibility is confirmed.

---

## 16. Branch/PR strategy

Each milestone should use a short sequence of vertical PRs, but the milestone is not
declared complete until its acceptance suite passes.

Example Milestone 1 sequence:

```text
PR 1  schema + domain + compatibility migration
PR 2  capability authorization + error codes
PR 3  organization identity API + audit
PR 4  account/session API + security invalidation
PR 5  MFA
PR 6  web Organization + Account UI
PR 7  desktop auth/security compatibility
PR 8  migration/integration/acceptance cleanup
```

Individual PRs may land progressively, but release tagging waits for the whole
milestone.

---

## 17. Product acceptance gate

Before calling Product Foundation v1 implementation complete:

- no organization-scoped action infers an arbitrary business;
- four-role permission matrix has backend integration coverage;
- multi-org member lifecycle works without cross-org side effects;
- rename/type/timezone settings preserve historical data;
- managed users cannot locally weaken collection policy;
- former-member restore/purge semantics work;
- device binding/limits work;
- all collection switches affect client transmission, not UI hiding only;
- retention reductions preview before delete;
- exports work before organization deletion;
- ownership transfer is atomic and invalidates stale sessions;
- archive/delete flows are reversible until the hard-delete point;
- TOTP + recovery codes + reset policy work;
- stable API errors are localized by web/desktop;
- RU/EN + Light/Dark acceptance is complete;
- fresh install and production upgrade paths both pass.

Only after this gate should ActiLens be treated as a product-ready release candidate
rather than a collection of working subsystems.
