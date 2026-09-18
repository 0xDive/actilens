# ActiLens Product Foundation Spec v1

Status: **proposal for approval**  
Scope: product model, organization/account lifecycle, settings, safety rules and implementation order.  
Implementation starts only after this spec is approved.

---

## 1. Why this exists

ActiLens already has a working monitoring core, RBAC, devices, audit, enrollment,
reports and a redesigned UI. The product model around those capabilities is still
too narrow.

Today a business mostly has:

- name;
- kind (`team` / `family`);
- screenshot retention;
- screenshot interval;
- idle threshold;
- employee override policy;
- screenshot mode;
- screenshot skip-app list.

This is not enough for a mature product. Organization identity, ownership, data
lifecycle, security, account settings, defaults and destructive changes need explicit
rules before more backend/UI work is added.

This spec defines those rules.

---

## 2. Product principles

### 2.1 Data must never disappear as a side effect of a cosmetic setting

Changing:

- organization name;
- organization type;
- user display name;
- role wording;
- language;
- timezone;
- capture labels;

must never delete historical data.

Any operation that can delete or invalidate data must be visually and technically
separate from ordinary settings.

### 2.2 Organization context is always explicit

No organization-scoped operation may infer "the user's business" when multiple
memberships can exist.

Every organization-scoped API should eventually be one of:

```text
/v1/businesses/:business_id/...
```

or require:

```text
business_id
```

explicitly.

This applies to:

- member management;
- devices;
- reports;
- settings;
- audit;
- retention;
- enrollment;
- desktop-managed policy;
- exports;
- future notifications.

The server remains authoritative: passing a `business_id` never grants access by
itself.

### 2.3 Settings changes have explicit safety classes

Every mutable product setting belongs to one of four classes.

| Class | Meaning | Examples | Confirmation |
|---|---|---|---|
| A | Metadata only | name, timezone | normal Save |
| B | Changes future collection | monitoring, screenshot interval | clear save/toggle |
| C | Can remove data | retention reduction, cleanup, purge | preview + explicit confirmation |
| D | Security / ownership | role elevation, owner transfer, session revoke | strong confirmation / re-auth where appropriate |

UI and backend should treat these classes differently.

### 2.4 Historical data is immutable by default

Changing current monitoring configuration does not rewrite old reports.

Examples:

- changing idle threshold affects future collection only;
- changing screenshot mode affects future captures only;
- disabling browser collection does not delete existing browser history;
- changing team type does not relabel stored events internally or delete anything.

Deletion is always a separate operation.

---

## 3. Organization model

The current `Business` model should evolve into a first-class organization object.

### 3.1 Core identity

Proposed fields:

```text
id
name
kind                     team | family
owner_user_id
timezone
week_starts_on            monday | sunday
created_at
updated_at
```

Potential later fields:

```text
description
avatar/logo
external_id
archived_at
deletion_scheduled_at
```

### 3.2 Rename organization

Permission:

- Owner: yes;
- Admin: yes;
- Manager: no;
- Employee: no.

Safety class: **A**.

Behavior:

- updates organization display name only;
- does not modify users;
- does not modify memberships;
- does not modify devices;
- does not modify activity, screenshots, browser history or keystrokes;
- does not revoke sessions;
- does not invalidate enrollment tokens;
- immediately updates organization switcher and new audit entries.

Audit event:

```text
organization.renamed
{
  "from": "Old name",
  "to": "New name"
}
```

UX:

- inline edit or small dialog;
- normal Save button;
- no destructive warning;
- validation: trimmed, 1–120 chars.

### 3.3 Change organization type

Current values:

- `team`;
- `family`.

Permission:

- Owner only initially.

Safety class: **A**, but requires semantic confirmation.

Critical rule:

**Changing organization type never deletes, migrates or resets existing data.**

It changes only product semantics/terminology and future type-specific presentation.

Team → Family confirmation should explicitly say:

```text
This changes how ActiLens describes the organization and its members.

Will change:
• Team → Family terminology
• Employee → Kid/family-member wording where applicable

Will NOT change:
• member accounts
• roles
• passwords
• monitoring state
• devices
• activity history
• screenshots
• browser history
• keystroke counts
• retention settings
• enrollment codes
```

Family → Team uses the inverse wording.

Important implementation rule:

Type-specific defaults are applied only when a new organization is created.

Changing an existing organization type must **not** silently reset:

- screenshot mode;
- retention;
- idle threshold;
- monitoring policy;
- privacy exclusions.

Audit:

```text
organization.kind_changed
{
  "from": "team",
  "to": "family"
}
```

### 3.4 Account persona and organization type are separate

Current user `account_type` is useful for onboarding, but one person may eventually
own or administer both team and family organizations.

Therefore:

- user `account_type` must not be treated as the permanent source of organization type;
- organization `kind` is authoritative for that organization;
- changing organization type must not automatically change the user's account type;
- future code should avoid deriving organization behavior from owner persona after creation.

---

## 4. Organization ownership and lifecycle

## 4.1 Ownership transfer

This is required before organization deletion/leave can be considered mature.

Permission: Owner only.  
Safety class: **D**.

Proposed flow:

1. Owner selects an existing Admin.
2. Product explains exactly what changes.
3. Owner re-enters their password.
4. Owner types the target person's display name or organization name.
5. Transaction locks organization and both memberships.
6. Target becomes Owner.
7. Previous owner becomes Admin by default.
8. Both users' security/session versions are bumped if needed.
9. Audit event is written atomically.

Restrictions:

- target must already be an active member of that organization;
- target should be Admin before transfer;
- transfer cannot target blocked/deactivated member;
- organization must always have exactly one Owner.

Audit:

```text
organization.owner_transferred
```

### 4.2 Leave organization

Admin / Manager:

- may leave voluntarily;
- their account is not deleted;
- organization data belonging to other users is unaffected;
- their own historical organization-scoped data remains according to org retention;
- device/session behavior must be defined before exposing this action.

Owner:

- cannot leave while still Owner;
- must transfer ownership first or delete the organization.

### 4.3 Archive organization

Useful before permanent deletion.

Safety class: **B/D**.

Archive should:

- stop new monitoring collection for the organization;
- prevent new enrollment;
- preserve all historical data;
- keep the organization recoverable;
- hide it from default active organization switcher;
- allow Owner to restore it.

This gives users a reversible alternative to deletion.

### 4.4 Delete organization

Do not ship a one-click hard delete.

Recommended mature flow:

1. Owner only.
2. Offer Export/Backup first.
3. Show exact data counts:
   - members;
   - devices;
   - screenshots + bytes;
   - activity rows;
   - browser visits;
   - keystroke buckets;
   - audit records.
4. Explain whether user accounts also belong to other organizations.
5. Require password re-authentication.
6. Require typing exact organization name.
7. Prefer a 7-day scheduled deletion window.
8. Archive/stop collection immediately.
9. Allow cancellation during grace period.
10. Hard-delete only after grace period.

Until this lifecycle exists, organization deletion should not be added just to have a
"Delete organization" button.

---

## 5. Members and access model

Existing roles:

- Owner;
- Admin;
- Manager;
- Employee.

These should stay internal even for `family`; UI terminology may differ.

### 5.1 Permission matrix target

| Capability | Owner | Admin | Manager | Employee |
|---|:---:|:---:|:---:|:---:|
| View reports | ✓ | ✓ | ✓ | own/local only |
| Manage employees | ✓ | ✓ | – | – |
| Change monitoring member state | ✓ | ✓* | – | – |
| Manage devices | ✓ | ✓* | – | – |
| Organization settings | ✓ | ✓ | – | – |
| Audit log | ✓ | ✓ | – | – |
| Change roles | ✓ | – | – | – |
| Transfer ownership | ✓ | – | – | – |
| Delete organization | ✓ | – | – | – |

`*` Admin cannot mutate Owner or peer Admin where current policy forbids it.

### 5.2 Member lifecycle

Member states should be conceptually distinct:

```text
active
blocked
archived/removed from organization
permanently purged
```

We should avoid using one boolean for every lifecycle meaning.

Definitions:

**Active**
- can sign in;
- can sync;
- membership active.

**Blocked**
- account/membership preserved;
- sync/login restricted according to policy;
- historical data preserved.

**Removed from organization**
- membership removed;
- user account may remain because it can belong to another organization;
- historical data retention behavior must be explicit.

**Permanent purge**
- destructive organization-scoped removal;
- existing purge semantics remain;
- account tombstoned only if no memberships remain.

### 5.3 Defaults for new members

Organization settings should eventually include:

- default role: Employee;
- monitoring enabled by default: yes/no;
- enrollment-code TTL default;
- whether password login is allowed before enrollment;
- optional required device enrollment.

These defaults affect only newly created members unless administrator explicitly
chooses "Apply to existing members".

---

## 6. Monitoring settings

The current settings cover only part of the monitoring policy.

Target section:

### 6.1 Organization monitoring master state

```text
organization_monitoring_enabled
```

Behavior:

- when disabled, all organization-managed collection fails closed;
- historical data remains;
- agents clearly show "Monitoring disabled by organization";
- member-level toggles cannot override the org-level off state.

Safety class: **B**.

### 6.2 New-member monitoring default

```text
default_member_monitoring_enabled
```

Applies only to new memberships.

### 6.3 Idle threshold

Existing.

Improvements:

- allow presets plus validated custom value;
- define min/max, e.g. 30 seconds – 60 minutes;
- state clearly that historical active-time reports are not recalculated.

### 6.4 Employee override

Existing.

Clarify exactly what an employee may override.

Instead of one vague boolean long-term, consider explicit capabilities:

```text
allow_pause_monitoring
allow_change_screenshot_capture
allow_change_browser_capture
```

For v1, the existing single flag can stay, but UI must explain what it covers.

### 6.5 Collection categories

ActiLens should eventually make each collection category explicit:

- application/window activity;
- active/idle time;
- screenshots;
- browser activity;
- keystroke counts.

Proposed organization settings:

```text
collect_app_activity
collect_window_titles
collect_browser_activity
collect_keystroke_counts
screenshots_enabled
```

Important:

- disabling a category stops future collection;
- it does not delete history;
- deletion lives under Data retention / Cleanup.

---

## 7. Screenshots and privacy

### 7.1 Screenshot enabled state

Current screenshot behavior lacks a first-class organization-level off switch.

Add:

```text
screenshots_enabled
```

If false:

- no screenshot upload/capture;
- interval and mode remain stored;
- turning screenshots back on restores previous configuration.

### 7.2 Screenshot mode

Existing:

- Privacy / active-window behavior;
- Normal / full screen.

Changing mode affects future captures only.

### 7.3 Screenshot interval

Existing.

Improvements:

- presets;
- optional custom interval;
- validated server range;
- explain storage impact.

Possible future preview:

```text
At 5 min with 8 active hours/day ≈ up to 96 captures/device/day.
```

Do not present an exact storage estimate unless enough real data exists.

### 7.4 Privacy exclusions

Existing skip-app list.

Future improvements:

- custom app rule;
- curated categories;
- rule match preview;
- clear inherited/default rules;
- optional window-title exclusion rules later.

### 7.5 Sensitive capture policy

Potential future settings:

- pause screenshots on password managers;
- pause screenshots during OS secure-input state;
- blur instead of skip (later);
- multi-monitor capture policy:
  - active display;
  - all displays.

These should be designed before being implemented individually.

---

## 8. Data retention and deletion

Current product has screenshot retention only.

Target retention policy should be per data class.

### 8.1 Retention categories

Proposed:

```text
activity_retention_days
screenshot_retention_days
browser_retention_days
keystroke_retention_days
audit_retention_days
```

Values:

- finite positive number;
- `null` = keep indefinitely, if allowed.

Audit may have a higher minimum than ordinary monitoring data.

### 8.2 Retention reductions are destructive changes

Example:

90 days → 7 days.

Do not save this like a harmless segmented-control click.

Flow:

1. User selects 7 days.
2. Backend offers a dry-run/preview:
   - records affected;
   - screenshot count;
   - bytes affected where applicable.
3. UI says:
   ```text
   Data older than 7 days will become eligible for permanent deletion.
   ```
4. Explicit Confirm button.
5. Audit old/new values.
6. Deletion runs through retention worker.

Safety class: **C**.

### 8.3 Manual cleanup

Current screenshot cleanup should become generic:

- screenshots;
- browser;
- activity;
- keystroke counts;
- eventually all monitoring data for a date range.

Every cleanup requires:

- preview;
- exact date cutoff;
- count/size when possible;
- destructive confirmation.

### 8.4 Export before delete

Before organization/member destructive actions, provide a path toward:

- CSV/JSON activity export;
- browser export;
- audit export;
- screenshot archive/manifest.

Full export can be phased, but destructive UI should already reserve this concept.

---

## 9. Devices and enrollment

### 9.1 Explicit organization scope

All device management uses the currently selected organization context.

This is a product rule, not merely a bug fix.

### 9.2 Enrollment policy

Organization settings should eventually expose:

- default enrollment-code validity:
  - 1 hour;
  - 24 hours;
  - 72 hours;
  - 7 days;
- one-time use always on;
- optionally require enrollment for managed desktop setup.

### 9.3 Device policy

Potential settings:

```text
max_devices_per_member
new_device_requires_admin_approval
```

Do not implement limits until UX for replacing/revoking devices exists.

### 9.4 Device actions

Existing:

- rename;
- revoke;
- restore.

Future:

- revoke all devices for member;
- "last sync" health;
- desktop version status;
- update required/outdated badge.

---

## 10. Account settings

Current web account section is read-only.

Minimum mature account settings:

### Profile

- display name;
- email;
- username where allowed;
- language;
- theme is already local preference.

### Security

- change password;
- active sessions;
- revoke other sessions;
- last password change;
- optionally MFA later.

### Email / username changes

Security class: **D** where login identity changes.

Rules:

- uniqueness check server-side;
- password re-authentication;
- bump auth/security version;
- revoke other sessions if appropriate;
- audit/security event.

### Password change

- current password required;
- new password rules;
- bump auth/security version;
- default behavior: revoke all other sessions.

### Delete personal account

Must be blocked while user owns an organization.

Flow:

1. transfer/delete organizations first;
2. explain memberships;
3. re-auth;
4. type confirmation;
5. apply correct shared-membership semantics.

---

## 11. Organization settings information architecture

Target web UI:

```text
Settings
├── Organization
│   ├── Name
│   ├── Type
│   ├── Timezone
│   ├── Week start
│   └── Ownership
│
├── Monitoring
│   ├── Organization monitoring
│   ├── Default monitoring for new members
│   ├── Idle threshold
│   ├── Employee override
│   ├── App/window collection
│   ├── Browser collection
│   └── Keystroke counts
│
├── Screenshots & privacy
│   ├── Screenshots enabled
│   ├── Capture mode
│   ├── Interval
│   └── Privacy exclusions
│
├── Data retention
│   ├── Activity
│   ├── Screenshots
│   ├── Browser
│   ├── Keystroke counts
│   ├── Audit
│   └── Manual cleanup / export
│
├── Devices & enrollment
│   ├── Enrollment code TTL
│   ├── Device policy
│   └── Device security defaults
│
├── Audit log
│
├── Account
│   ├── Profile
│   ├── Password
│   └── Sessions
│
└── Danger zone
    ├── Archive organization
    ├── Transfer ownership
    └── Delete organization
```

Not every line must ship in the first implementation phase.

---

## 12. Change confirmation rules

### No confirmation beyond Save

- organization rename;
- timezone;
- week-start preference;
- increasing retention;
- screenshot interval;
- harmless UI preferences.

### Informational confirmation

- team ↔ family conversion;
- disabling a collection category;
- organization-wide monitoring off;
- archive organization.

### Strong destructive confirmation

- reducing retention;
- manual cleanup;
- permanent member purge;
- delete organization.

Strong confirmation includes:

- exact impact;
- affected data summary;
- typed organization/member name;
- explicit destructive button color;
- no destructive action focused by default.

### Security confirmation / re-auth

- ownership transfer;
- login email/username change;
- password change;
- revoke all sessions;
- delete personal account;
- delete organization.

---

## 13. Audit requirements

Every administrative mutation should create an audit event.

Add event families:

```text
organization.renamed
organization.kind_changed
organization.archived
organization.restored
organization.owner_transferred
organization.deletion_scheduled
organization.deletion_cancelled

settings.monitoring_changed
settings.collection_changed
settings.screenshot_changed
settings.retention_changed

account.profile_changed
account.login_changed
account.password_changed
account.sessions_revoked
```

Audit event details must never contain:

- passwords;
- enrollment tokens;
- JWTs;
- screenshot content;
- raw browser page content.

For settings events, storing old/new non-secret values is desirable.

---

## 14. Multi-organization behavior

ActiLens already permits multiple memberships at the data-model level.

Before expanding settings, define these rules:

### Web admin

- always has one selected organization;
- every action uses that explicit organization;
- changing selected organization changes reports/settings scope only.

### Desktop managed mode

A desktop device/session must know which organization is currently governing it.

Do not rely on:

```text
ResolveBusinessForUser(user)
```

when multiple memberships exist.

Preferred long-term model:

- enrollment binds the managed desktop/device to an organization;
- desktop stores or receives the bound `business_id`;
- policy requests are organization-scoped;
- switching organization is explicit, not inferred.

This area should receive a dedicated technical design before true multi-org employee
usage is advertised.

---

## 15. Error and conflict UX

Raw server text such as:

```text
insufficient permission
```

should not be the final product UX.

Standard error categories:

- Permission denied;
- Resource no longer exists;
- Conflict / changed elsewhere;
- Validation;
- Network/server;
- Destructive operation unavailable.

Example:

```text
You no longer have permission to manage devices in this organization.
Refresh the page or contact the organization owner.
```

Backend error codes should eventually be stable machine-readable values, with UI
localizing the final message.

---

## 16. Implementation priorities

## Phase 0 — product invariants and organization scope

Do before broad new settings.

- audit organization-scoped APIs;
- require/propagate explicit `business_id` where appropriate;
- define desktop managed organization binding;
- stable API error codes;
- audit-event convention.

## Phase 1 — organization and account basics

Highest user-visible maturity improvement.

- rename organization;
- change team/family type safely;
- timezone/week start;
- edit own display name;
- change own password;
- active sessions / revoke sessions;
- audit all changes.

## Phase 2 — monitoring completeness

- organization master monitoring state;
- default monitoring state for new members;
- explicit collection toggles:
  - app/window;
  - browser;
  - keystroke counts;
  - screenshots;
- clarify employee override semantics;
- custom validated idle threshold.

## Phase 3 — retention and privacy

- per-data-class retention;
- retention change preview;
- generic cleanup preview + confirmation;
- screenshot/privacy refinements;
- export foundation.

## Phase 4 — organization lifecycle/security

- ownership transfer;
- archive/restore organization;
- leave organization;
- session/device security improvements;
- safe scheduled organization deletion.

## Phase 5 — later product expansion

Not required before the core product is mature:

- notifications;
- webhooks;
- SSO;
- SCIM;
- integrations;
- advanced policy templates;
- billing/pricing;
- public marketing-site feature expansion.

---

## 17. Recommended first implementation batch

After approval, the first backend/UI batch should be deliberately small:

1. **Organization rename**
2. **Organization type change**
3. **Account display-name change**
4. **Password change**
5. **Audit events for all four**
6. **Stable UI confirmations and error codes**

Why this batch:

- high user value;
- low risk to historical monitoring data;
- establishes safe mutation patterns;
- creates infrastructure for more complex settings later.

Do not combine this first batch with retention deletion or ownership transfer.

---

## 18. Definition of done for a new setting

A setting is not complete merely because a database column and toggle exist.

Every setting requires:

- product meaning documented;
- default defined;
- permission defined;
- safety class defined;
- validation defined;
- API behavior defined;
- historical-data behavior defined;
- multi-org scope defined;
- audit event defined;
- RU/EN copy;
- Light/Dark UI;
- error state;
- test coverage;
- migration/default compatibility for existing installations.

---

## 19. Decisions requiring explicit approval

Before implementation, confirm these product decisions:

1. Organization type change is metadata/terminology only and never resets policies.
2. Owner-only for team ↔ family conversion.
3. Admin may rename an organization.
4. Historical monitoring data is never retroactively recalculated after policy changes.
5. Disabling collection preserves old data.
6. Retention reductions require destructive confirmation.
7. Organization deletion should use archive + grace period rather than immediate hard delete.
8. Desktop managed mode must eventually bind explicitly to one organization.
9. User account persona and organization kind are separate concepts.
10. New settings must be auditable and organization-scoped.

Once these decisions are accepted, implementation can be split into API/schema/UI PRs
without inventing product behavior during coding.


---

## 20. Approved product decisions

The following decisions are approved and are no longer open questions.

### Organization

- Organization rename: **Owner + Admin**.
- Organization type change: **Owner only**.
- Type changes never delete or reset historical data/policies.
- Organization kinds must be extensible beyond Team/Family.
- Organization has an explicit editable timezone.
- Week start is an organization setting.
- Ownership transfer is required.
- Organization archive/restore is required.
- Permanent organization deletion must go through archive first; immediate one-click hard delete is not part of the product model.

### Member lifecycle

Member lifecycle is explicitly separated into:

- active;
- blocked;
- removed from organization;
- permanently purged.

Blocking preserves history and prevents login/sync according to the organization scope.
Removing from an organization preserves historical data and does not destroy a shared account.
Permanent purge remains an explicit irreversible organization-scoped operation and tombstones the account only when no memberships remain.

Because users can belong to multiple organizations, blocked/removed state must ultimately be represented at the **membership** level rather than by overloading one global user-active flag.

### RBAC

The product keeps exactly four built-in roles for v1:

- Owner;
- Admin;
- Manager;
- Employee.

Admin may manage Employee/Manager but not Owner or peer Admin.

Implementation direction: roles remain product-facing presets, while backend authorization is centralized around explicit capabilities/permissions. New endpoints must check a named permission rather than scatter direct role comparisons through handlers/stores. This preserves the four-role UX while keeping the authorization model extensible.

### Monitoring and collection

- No organization-wide master monitoring switch for now.
- New-member default monitoring state is configurable.
- Managed employees cannot override/pause organization monitoring settings locally.
- Admin/Owner configure managed monitoring from the web console.
- Local-only mode remains independently configurable by the local user.
- Organization collection categories are explicit:
  - application activity;
  - window titles;
  - active/idle;
  - screenshots;
  - browser activity;
  - keystroke counts.
- Window-title collection can be disabled while application-name collection remains enabled.
- There is no separate duplicate "browser master" setting outside the collection-category model; browser collection is controlled by the browser collection capability above.
- Keystrokes are permanently **counts only**. Typed content is never collected.
- Disabling a collection category affects future collection only and never deletes historical data.
- Historical reports are never retroactively recalculated after monitoring-policy changes.

### Screenshots and privacy

- Screenshots have a first-class enabled/disabled setting.
- Capture area is separated from privacy behavior.
- Capture scope supports the product model:
  - active window only;
  - full active display;
  - all displays.
- Multi-monitor behavior is explicitly designed now even if some modes ship later.
- Privacy exclusions support application rules and should be extensible to window-title rules.
- Disabling screenshots preserves the configured capture scope, interval and privacy rules for later re-enable.

### Retention and cleanup

Retention is separate by data class.

Approved default proposal:

| Data | Default retention |
|---|---:|
| Activity / active-idle / app-window data | 180 days |
| Screenshots | 30 days |
| Browser activity | 90 days |
| Keystroke counts | 90 days |
| Audit log | 365 days |

`null` may represent keep indefinitely where policy permits it.

Reducing retention is destructive and requires a backend preview before confirmation.
Manual cleanup becomes a unified data-cleanup flow with data type + date range, not a screenshot-only action.
Export is part of the product lifecycle and should exist before high-impact destructive operations.

### Enrollment and devices

- Enrollment-code default TTL is configurable; proposed default: **24 hours**.
- Enrollment tokens remain one-time use.
- New validly enrolled devices are accepted automatically.
- Per-member device limit is configurable; `null` means unlimited.
- Proposed initial default is **unlimited** to avoid surprising enrollment failures in existing installations.
- Admin/Owner must see whether installed agents are current/outdated/unknown.
- No minimum enforced desktop version yet.
- A managed device is explicitly bound to exactly one organization.
- A device does not automatically switch between organizations.
- Multi-organization users are supported, but each managed device has one governing organization context.

This requires a future `devices.business_id` (or equivalent binding) and a migration/backfill plan for existing devices.

### Account and security

- Users cannot change their own display name in v1; managed profile naming remains administrator-controlled where applicable.
- Login identifier (email/username) is changeable with security confirmation.
- Password change revokes existing sessions and forces fresh authentication.
- Active sessions UI is required, including revoke/revoke-all controls.
- Account deletion is required; an Owner must transfer/delete owned organizations first.
- MFA/2FA support is part of the core product, not a distant post-v1 idea.

### Audit and errors

- All administrative changes are audited.
- API moves to stable machine-readable error codes such as:
  - `permission_denied`;
  - `not_found`;
  - `conflict`;
  - `validation_error`;
  - `reauth_required`.
- Frontends localize the final RU/EN message instead of displaying raw backend strings.

### Settings behavior

- Most safe settings save immediately.
- Text/form metadata such as organization name uses explicit Save where appropriate.
- Security/destructive actions always use dedicated confirmation flows.
- When a default changes (for example default monitoring for new members), UI asks whether to apply it to existing members; it never silently rewrites existing memberships.

### Local-only mode

Local-only desktop mode remains supported.
Managed-mode restrictions do not remove local control from users who intentionally operate in local-only mode.

---

## 21. Implementation order after final clarification

The dependency-first order is:

1. **Organization scope + RBAC foundation**
   - explicit organization context everywhere;
   - capability-based authorization layer behind the four roles;
   - membership lifecycle state model;
   - stable API errors;
   - audit mutation convention.

2. **Organization + account maturity**
   - rename;
   - type change;
   - timezone/week start;
   - login identifier/password/session management;
   - MFA foundation.

3. **Member lifecycle**
   - block/unblock;
   - remove/restore membership where applicable;
   - former-members view;
   - purge remains separate.

4. **Device + enrollment model**
   - organization-bound devices;
   - configurable device limits;
   - default token TTL;
   - version health/status.

5. **Collection policy completeness**
   - explicit data-category switches;
   - screenshots enabled;
   - capture scope;
   - privacy rules;
   - new-member defaults;
   - no managed employee overrides.

6. **Retention/export/cleanup**
   - per-class retention;
   - dry-run previews;
   - unified cleanup;
   - export foundation.

7. **Organization lifecycle**
   - ownership transfer;
   - archive/restore;
   - leave organization;
   - scheduled permanent deletion.

8. **Release hardening**
   - migration tests from existing production schema/data;
   - end-to-end RBAC matrix;
   - RU/EN and error-state acceptance;
   - desktop/web multi-org tests;
   - destructive-operation recovery tests.


---

## 22. Approved clarification round 2

These decisions are approved.

### Organization kinds and terminology

- Built-in organization kinds for the current product model are:
  - `team`;
  - `family`;
  - `other`.
- `other` uses neutral organization/member terminology.
- The schema/API must allow adding more kinds later without redesigning the organization model.
- Custom administrator-defined member nouns are not part of v1.

### Time and reporting boundaries

- A new organization defaults its timezone from the creator's browser/device timezone.
- The organization timezone is editable.
- Stored event timestamps are never rewritten when timezone changes.
- Day/report grouping is recalculated using the current organization timezone, so historical day boundaries may be displayed differently after a timezone change.
- Week start defaults to locale behavior but can be explicitly overridden to a chosen day in settings.

### Archive and deletion lifecycle

Archived organization behavior:

- new sync is rejected;
- new enrollment is rejected;
- managed collection stops;
- historical reports remain available to Owner/Admin in read-only mode;
- organization can be restored.

Permanent organization deletion:

- requires the organization to enter the archive/deletion flow first;
- uses a **7-day cancellation window** before hard deletion;
- export/full backup is offered before scheduling deletion but is not mandatory;
- a user may explicitly proceed without exporting.

Ownership transfer:

- target must be an active existing Admin;
- target becomes Owner;
- previous Owner becomes Admin;
- transfer is a strong security operation and is audited.

### Former members

- Removed members appear in a dedicated **Former members** view.
- Historical organization-scoped reports remain read-only until retention/purge removes them.
- A removed member may be restored to the organization using the same user/account identity.
- Blocking is organization-scoped membership state, not global user state.
- Blocking a user in organization A does not block that account in organization B.

### Manager and RBAC

- Manager is read-only for administrative purposes:
  - may view Dashboard;
  - may view roster;
  - may view permitted reports;
  - may not change members, devices, monitoring or settings.
- Product-facing roles remain exactly Owner/Admin/Manager/Employee.
- Backend authorization should evolve to capability-based checks behind those role presets.
- Custom roles are not exposed in v1, but the internal permission model should not prevent them later.

### Managed desktop control

- Managed employees cannot pause monitoring or change organization-controlled collection policy from the desktop app.
- Desktop must clearly show that monitoring is managed by the organization and what categories are enabled.
- Local-only mode remains locally controllable.
- ActiLens must not claim it can prevent a Windows administrator from uninstalling or stopping software; instead product health/offline/device state makes this visible to admins.

### Screenshot model

Capture scope is explicitly separated from privacy rules.

Approved scopes:

- active window only;
- active display;
- all displays.

Privacy exclusions apply independently of capture scope.
Window-title exclusion rules initially use simple **contains** matching; regex is not required in v1.

### Retention defaults

Approved defaults:

| Data class | Default |
|---|---:|
| Activity / app / window / active-idle | 180 days |
| Screenshots | 30 days |
| Browser activity | 90 days |
| Keystroke counts | 90 days |
| Audit log | keep indefinitely |

Where appropriate, retention supports an explicit indefinite option.
Reducing retention requires preview + destructive confirmation.

### Export

- Structured monitoring data export supports CSV/JSON where appropriate.
- Screenshots export supports archive + manifest.
- Full organization export should be offered before organization deletion.
- Export is not mandatory to proceed with deletion.

### Enrollment and devices

- Device limits count active/non-revoked devices.
- Device limit is configurable per organization; `null` means unlimited.
- When the limit is reached, enrollment fails with stable error `device_limit_reached` and explains that an admin must revoke a device or raise the limit.
- Agent version health states are:
  - Current;
  - Outdated;
  - Unknown.
- Version status is advisory only for now; no enforced minimum desktop version yet.

### Profile and login identity

- Owner/Admin may manage employee display names where permitted.
- Owner may change their own display name.
- Ordinary managed employees do not edit their own display name in v1.
- A user may change their own login identifier through secure account settings.
- Login-identifier changes require current-password reauthentication, server-side uniqueness validation, security-version/session invalidation as designed, and audit/security events.

### Password changes

- Successful password change revokes **all sessions including the current session**.
- User must sign in again with the new password.

### MFA / 2FA

Initial MFA implementation:

- TOTP authenticator support;
- one-time recovery codes;
- no SMTP/SMS dependency required.

MFA is voluntary per account in v1.
If MFA is enabled for an account, critical operations require a fresh MFA challenge in addition to password reauthentication where applicable, including:

- ownership transfer;
- organization deletion;
- personal-account deletion.

Organization-wide mandatory MFA enforcement is not required in v1.

### Sessions

Session management page shows:

- Web/Desktop client type;
- browser/device descriptor where available;
- creation time;
- last-used time;
- current-session marker.

Raw/approximate IP is not shown to the user in v1.
Actions:

- revoke one session;
- revoke all other sessions.

### Personal-account deletion

- Personal-account deletion is immediate after required eligibility checks, reauthentication and typed confirmation.
- There is no personal-account deletion grace period.
- A user cannot delete their personal account while they still own an organization; ownership must be transferred or the organization lifecycle completed first.

### Local-only to managed enrollment

- Existing local-only history is **not** uploaded automatically when the installation becomes managed.
- Server collection starts only after explicit organization enrollment.
- This is a privacy invariant.

### Device organization binding

- A managed device is bound to one organization.
- Moving that installation to a different organization requires explicit unenroll/re-enroll.
- There is no automatic organization dropdown switch for one managed device.

### Applying changed defaults

When an organization changes a new-member default such as monitoring enabled:

- UI asks whether the change applies only to future members or also to existing memberships;
- if applying to existing members, backend provides/uses an affected-member count;
- UI confirms the count before bulk mutation;
- bulk mutation is audited.


---

## 23. Approved clarification round 3 — final product decisions

This section supersedes earlier open questions where there is any conflict.

### Organization deletion and user accounts

When an organization is permanently deleted:

- organization-scoped memberships and monitoring data are deleted according to the deletion job;
- managed user accounts that have no remaining memberships are deleted with the organization;
- a user account that still belongs to another organization cannot be destroyed as a side effect of deleting one organization; only the deleted membership and organization-scoped data are removed;
- this multi-organization safety rule is an implementation invariant even though the normal single-organization managed-account outcome is account deletion.

### Self-service account deletion

There is **no self-service Delete account button for managed users in v1**.

Managed-account lifecycle is controlled through organization/member lifecycle operations.
A user who is still a member of an organization cannot self-delete their identity from underneath organization-owned history.

Standalone/local-only account deletion can be reconsidered separately later, but it must not be conflated with managed-member deletion.

### Former-member visibility

- Owner/Admin can view Former members and their retained historical reports.
- Manager sees active members only and does not receive former-member history access in v1.

### Restore former member

Restoring a former member:

- reuses the same user/account identity;
- preserves and reconnects retained historical organization data;
- restores the member with the built-in Employee role rather than silently restoring a previous elevated role;
- asks whether monitoring should be enabled or disabled as part of the restore operation;
- writes an audit event.

### Blocked member experience

A member blocked in an organization may still authenticate to their account where technically appropriate, but:

- managed sync for the blocked organization is rejected;
- organization access is suspended;
- UI/desktop shows an explicit suspended-by-organization state instead of pretending credentials are invalid;
- blocking remains membership-scoped, so other organization memberships continue to work.

### Permanent member purge

Permanent purge is **Owner only**.
Admin cannot permanently purge organization data.

### Archived organization permissions

While archived, the organization is read-only except for restoration/cancellation actions.

Allowed for Owner/Admin:

- reports/history;
- export;
- audit log;
- former-members history;
- restore organization;
- cancel scheduled deletion where allowed.

Not allowed while archived:

- new enrollment;
- member mutations;
- monitoring-policy mutations;
- device mutations;
- new sync/collection.

Restoring an archived organization immediately restores its previous operational state and monitoring policy. There is no extra "resume" step.

### Scheduled deletion state

During the 7-day deletion window:

- organization remains archived/read-only;
- monitoring and sync remain disabled;
- deletion may be cancelled by the Owner;
- hard deletion runs only after the deadline.

### Security invalidation after privilege changes

Ownership transfer revokes all active sessions for both the previous and new Owner.
Both must sign in again.

Role demotion from Admin to Manager/Employee also revokes that user's active sessions so stale permissions cannot survive in existing access/refresh tokens.

The same security-version/session invalidation principle applies to other privilege reductions.

### Internal RBAC capabilities

Approved initial capability vocabulary:

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

Roles are fixed product presets mapped to capabilities. Frontends show the four roles, not raw capability editing.

### Mandatory monitoring core

Managed monitoring always includes active/idle state as the core signal.
It is not independently disableable in managed mode.

Optional organization-controlled collection categories are:

- application names;
- window titles;
- screenshots;
- browser activity;
- keystroke counts.

If window-title collection is disabled, clients do not transmit window titles at all. The server does not merely hide them in UI.

### Privacy-rule evaluation

Initial privacy matching is case-insensitive.

Supported first-pass rules:

- application exact/contains as defined by the policy representation;
- window title contains.

When a privacy exclusion matches, the screenshot is **not captured/created in the first place**. ActiLens must prefer prevention over capture-then-delete for sensitive exclusions.

### Multi-display screenshots

For all-displays capture:

- each display image is stored as its own screenshot record;
- records captured at the same moment share a common `capture_group_id`;
- this supports per-display metadata, cleanup and gallery grouping without storing multi-display blobs.

### Device-limit semantics

- only active/non-revoked devices consume the limit;
- revoking a device frees a slot immediately;
- restoring a revoked device is rejected with `device_limit_reached` if the configured limit is already occupied.

### Agent-version visibility

Version health is shown at all three levels:

- badge on the device itself;
- warning/context on the employee page;
- aggregate Dashboard indicator such as "3 devices need an update".

No minimum-version enforcement yet.

### MFA recovery and reset

- generate 10 one-time recovery codes;
- store only cryptographic hashes;
- recovery codes cannot be displayed again after initial generation;
- regenerating codes invalidates all previous recovery codes.

MFA reset policy:

- Admin may reset MFA for Employee/Manager;
- Owner may reset MFA for organization members except the Owner's own MFA;
- Owner self-recovery requires recovery codes or a dedicated secure self-recovery path;
- MFA reset revokes affected user sessions and is audited.

### Managed login identity

Owner/Admin may change a managed member's username/email without knowing the member's old password.
The operation:

- validates uniqueness;
- revokes all sessions for that account;
- bumps the account security version;
- is audited.

### Username and email model

A user may have **both** a username and an email address.
They are separate attributes rather than mutually exclusive alternatives.
Either may be accepted as a login identifier where unique and enabled by the auth implementation.

Email verification is not required in v1; self-hosted deployment must not depend on SMTP.

### Notification foundation

The architecture may reserve a notification/event layer for future product events such as:

- outdated device;
- long-offline member/device;
- pending organization deletion;
- ownership transfer;
- security events.

Notification delivery/UI is not part of the first implementation milestone.

### First implementation milestone

The first implementation milestone is approved as:

**Organization Core + RBAC Foundation + Account Security**

It includes the prerequisites required to make later settings/lifecycle work complete rather than piecemeal.
