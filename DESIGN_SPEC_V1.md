# ActiLens Design Spec v1

Status: **proposal for approval**  
Scope: web admin first, then shared visual language for desktop and browser extension.  
Implementation starts only after this spec is approved.

---

## 1. Product design direction

ActiLens should look like a calm, precise B2B operations product: trustworthy,
dense enough for daily work, easy to scan, and intentionally restrained.

The interface must not rely on decorative glassmorphism, large gradients, glowing
cards or excessive pills. Brand color is an accent, not the background of the
product.

### Design principles

1. **Clarity before decoration** — every element must help reading, navigation or action.
2. **One visual language** — one component system, one spacing scale, one typography scale.
3. **High information density without visual noise** — especially tables and reports.
4. **Status is semantic** — green/amber/red are reserved for actual state, not decoration.
5. **Destructive actions are separated** — permanent deletion never sits next to routine actions.
6. **Light and dark are equal themes** — dark mode is designed, not mechanically inverted.
7. **Keyboard and accessibility are first-class** — focus, contrast and target sizes are explicit.
8. **Desktop-first** — admin is optimized for 1280–1920 px, while remaining usable at 1024 px.

---

## 2. Brand language

### Personality

- precise
- quiet
- professional
- modern
- technical without looking developer-only
- privacy-aware
- confident, not aggressive

### Brand accent

ActiLens keeps violet as the primary brand color, but it is used only for:

- primary actions;
- selected navigation;
- active tabs;
- focus rings;
- selected controls;
- small brand moments.

Large violet gradients are removed from application surfaces.

---

## 3. Typography

Primary family: **Manrope Variable**.

Fallback:

```css
font-family: "Manrope Variable", "Manrope", "Segoe UI", system-ui, sans-serif;
```

### Type scale

| Token | Size | Weight | Line height | Use |
|---|---:|---:|---:|---|
| text-xs | 12 px | 500 | 16 px | metadata, captions |
| text-sm | 13 px | 500 | 18 px | secondary UI |
| text-md | 14 px | 500 | 20 px | default UI/body |
| text-lg | 16 px | 600 | 22 px | card titles |
| heading-sm | 20 px | 700 | 26 px | section/page subsection |
| heading-md | 24 px | 700 | 30 px | page title |
| heading-lg | 32 px | 700 | 38 px | auth/onboarding only |

Numbers in reports use tabular numerals:

```css
font-variant-numeric: tabular-nums;
```

Rules:

- no 800/900 weight in normal application UI;
- no uppercase headings except compact table headers/labels;
- table headers use 12 px / 600;
- muted text must remain readable in both themes.

---

## 4. Color system

No raw color literals inside page/components after migration. Components use semantic
tokens only.

### Light

```text
--bg-app              #F5F6F8
--bg-surface          #FFFFFF
--bg-subtle           #F0F2F5
--bg-hover            #ECEFF3
--bg-selected         #F0EEFF

--border-subtle       #E6E8EC
--border-default      #D9DDE4
--border-strong       #C8CDD6

--text-primary        #181B20
--text-secondary      #5E6673
--text-tertiary       #858E9C
--text-inverse        #FFFFFF

--brand               #6D5DFB
--brand-hover         #5C4CEF
--brand-pressed       #4E40D8
--brand-soft          #EFEDFF

--success             #16885A
--success-soft        #E7F6EF
--warning             #B7791F
--warning-soft        #FFF4DC
--danger              #D14343
--danger-soft         #FCEAEA
--info                #3777D6
--info-soft           #EAF1FC
```

### Dark

```text
--bg-app              #0F1115
--bg-surface          #15181E
--bg-subtle           #1B1F27
--bg-hover            #222731
--bg-selected         #27223E

--border-subtle       #232832
--border-default      #2E3440
--border-strong       #404856

--text-primary        #F3F5F7
--text-secondary      #A7AFBC
--text-tertiary       #77808F
--text-inverse        #111318

--brand               #8B7CFB
--brand-hover         #9A8CFF
--brand-pressed       #7566EA
--brand-soft          #292442

--success             #4AC28A
--success-soft        #173126
--warning             #E3AA4E
--warning-soft        #332916
--danger              #EF6A6A
--danger-soft         #351C20
--info                #77A6EF
--info-soft           #1B2940
```

### Surface rules

- app background is flat;
- cards do not use blur/backdrop-filter;
- normal cards use a 1 px border;
- shadows are reserved for popovers, dropdowns and modals;
- no glow effects in daily UI.

---

## 5. Spacing and geometry

Base spacing unit: **4 px**.

```text
space-1   4
space-2   8
space-3   12
space-4   16
space-5   20
space-6   24
space-8   32
space-10  40
space-12  48
```

### Radius

```text
radius-sm   6 px    compact controls
radius-md   8 px    buttons, inputs
radius-lg  12 px    cards, tables
radius-xl  16 px    modals only
radius-pill 999 px  badge/status only
```

Pills are not a default container shape.

---

## 6. Application shell

### Desktop layout

```text
┌────────────────┬──────────────────────────────────────────────┐
│ Sidebar        │ Page                                         │
│ 232 px         │                                              │
│                │ Header 56 px                                 │
│ Logo + org     ├──────────────────────────────────────────────┤
│ Navigation     │                                              │
│                │ Content max-width 1440 px                    │
│                │                                              │
│ Account        │                                              │
└────────────────┴──────────────────────────────────────────────┘
```

### Sidebar

Expanded width: **232 px**.  
Collapsed width: **68 px**.

Order:

1. ActiLens logo/name;
2. organization switcher;
3. navigation:
   - Обзор;
   - Сотрудники;
   - Настройки (permission-dependent);
4. flexible spacer;
5. account/profile.

Navigation item:

- height 40 px;
- radius 8 px;
- icon 18 px;
- selected = brand-soft background + brand foreground;
- no glow;
- selected state must not depend only on color.

At viewport below 1180 px sidebar defaults to collapsed.

### Top header

Height: **56 px**.

Left:

- optional breadcrumb;
- detail context only.

Right:

- contextual page actions if required;
- account dropdown only when sidebar collapsed.

Theme and language controls move into account/preferences; they are removed from the
permanent top bar.

### Content container

```text
max-width: 1440px
margin: 0 auto
padding-inline: 32px
padding-block: 28px 40px
```

At <= 1280 px: 24 px gutters.  
At <= 1080 px: 20 px gutters.

No arbitrary narrow centered page block on 1600–1920 px screens.

---

## 7. Page header pattern

Every top-level page gets exactly one page title.

Structure:

```text
Title                       Primary action
Short context / count       Secondary action (optional)
```

Example:

```text
Сотрудники                              [Добавить сотрудника]
1 сотрудник · Pan
```

Do not repeat the same title in topbar and content.

---

## 8. Component specifications

## 8.1 Button

Heights:

- small: 32 px;
- default: 36 px;
- large: 40 px.

Variants:

- primary;
- secondary;
- ghost;
- danger;
- danger-ghost.

Rules:

- one primary action per local action group;
- destructive is never purple;
- icon 16 px;
- horizontal padding 12–16 px;
- loading state preserves width;
- disabled remains readable.

## 8.2 IconButton

- 32 or 36 px square;
- tooltip required for icon-only actions;
- minimum interactive target 36 px in tables.

## 8.3 Input / Select

- default height 40 px;
- radius 8 px;
- label 13 px / 600;
- help/error text 12 px;
- focus: 2 px brand ring;
- validation is text + color, never color only.

## 8.4 Switch

Use for binary operational state such as monitoring.

- track: 36×20;
- thumb: 16 px;
- label always visible outside the switch;
- state text: Включён / Отключён where ambiguity matters.

## 8.5 Badge

Only for compact semantic metadata:

- role;
- status;
- device state;
- release/permission state.

Not for normal buttons/actions.

## 8.6 Card

- background surface;
- border 1 px;
- radius 12 px;
- padding 20–24 px;
- no blur;
- no default shadow.

## 8.7 Data table

Header: 40 px.  
Row: **64 px** default.  
Compact row: 52 px where safe.

Rules:

- content vertically centered;
- row hover = subtle surface change;
- entire row can be clickable where appropriate;
- rightmost `⋯` menu for contextual actions;
- no multiline action stack inside a row;
- sticky header for long tables;
- empty/loading/error states occupy the table surface.

## 8.8 Dropdown / context menu

- width 220–280 px;
- radius 10 px;
- 6 px inner padding;
- item height 36 px;
- separators only between semantic groups;
- destructive group at bottom.

## 8.9 Modal

Widths:

- confirm: 420–480 px;
- form: 520 px;
- complex: 640 px.

Footer has right-aligned actions.

Permanent delete confirmation must include:

- destructive title;
- exact consequence copy;
- typed confirmation where currently required;
- danger button.

## 8.10 Toast

All routine save/create/update success feedback uses toast rather than page-layout
messages unless the message itself is page content.

Positions: top-right desktop.  
Duration: 4–5 seconds.  
Errors persist longer or until dismissed when actionable.

## 8.11 Skeleton / loading

Use skeletons for page/table/card data. Avoid replacing a whole page with a centered
spinner after shell has loaded.

---

## 9. Employees screen

This is the first screen to migrate after the shell because it currently exposes
the most visible consistency problems.

### Header

```text
Сотрудники                              [Добавить сотрудника]
1 сотрудник · Pan
```

"Новая команда" is removed from this page. Team creation belongs to the organization
switcher/menu.

### Table columns

```text
Сотрудник | Логин | Роль | Мониторинг | Текущее приложение | Последняя активность | ⋯
```

Recommended widths:

- Employee: min 220 px;
- Login: 140 px;
- Role: 130 px;
- Monitoring: 150 px;
- Current app: flexible min 180 px;
- Last active: 140 px;
- actions: 44 px.

### Employee cell

```text
[K]  Кадры
 ●   Online
```

Avatar 36 px. Presence is both dot and accessible text/title.

### Role

Owner/admin can use a compact select where permitted.
Read-only roles display a badge/text, not a disabled select.

### Monitoring

Use switch + semantic text:

```text
[on] Включён
```

### Current application

```text
Microsoft Word
сейчас
```

or:

```text
—
12 минут назад
```

### Row interaction

Clicking non-control area opens employee detail.

### Context menu

Routine:

- Открыть профиль;
- Код установки;
- Изменить;
- Сменить пароль;
- Заблокировать / Разблокировать.

Then separator.

Danger:

- Удалить навсегда…

No permanent deletion link is visible directly in the table.

---

## 10. Dashboard

The dashboard answers four questions:

1. What is happening now?
2. How active is the team today?
3. Who needs attention?
4. Which apps/work patterns dominate?

### Layout

Row 1: KPI cards

- Active now;
- Active time today;
- Idle/offline;
- Screenshots / monitored devices depending on available data.

Row 2:

- 8-column activity trend;
- 4-column team status.

Row 3:

- 6-column top applications;
- 6-column recent activity / screenshots.

Cards share one visual system. There is no special unrelated "hero card" style.

### KPI card

- label 13 px;
- value 28–32 px;
- delta/status 12–13 px;
- optional small sparkline;
- no gradient background.

---

## 11. Employee detail

Header:

```text
← Сотрудники

[K] Кадры                         [Monitoring status] [⋯]
    kadr · Сотрудник
    ● Online · Microsoft Word
```

Tabs:

- Обзор;
- Активность;
- Скриншоты;
- Браузер;
- Устройства.

One shared date-range filter for report tabs.

### Overview

- activity summary;
- top apps;
- last seen / current app;
- device state;
- recent screenshots.

### Activity

- timeline;
- app breakdown;
- active/idle summary.

### Screenshots

- compact gallery;
- time grouping;
- consistent selected/preview state.

### Browser

- top domains;
- visit table.

### Devices

- device name;
- hostname/platform;
- version;
- last seen;
- revoked state;
- context actions.

---

## 12. Settings

Settings become structured navigation rather than one long collection of rows.

Sections:

1. **Организация**
2. **Мониторинг**
3. **Скриншоты и приватность**
4. **Хранение данных**
5. **Audit log**
6. **Аккаунт**
7. **Danger zone** where applicable

At >= 1180 px settings use a two-column layout:

```text
section nav 200 px | settings content
```

At smaller widths section navigation becomes horizontal/stacked.

### Settings row

Use:

```text
Title
Explanation                  Control
```

Max control column width: 420 px.

No page-wide chains of unrelated segmented controls.

---

## 13. Auth and onboarding

Login/signup:

- centered max 420 px form;
- quiet flat background;
- brand logo;
- no decorative dashboard chrome;
- consistent inputs/buttons from the same component library.

Signup wizard:

- explicit progress indicator;
- one concept per step;
- clear back/continue hierarchy.

---

## 14. Desktop app alignment

Desktop keeps platform-specific behavior but shares:

- Manrope;
- brand accent;
- semantic status colors;
- button/input geometry;
- card and dialog language;
- icons;
- terminology;
- empty/error/loading patterns.

Desktop does not need the web admin sidebar.

Onboarding and consent must visually match the new auth family.

---

## 15. Browser extension alignment

Popup target width: 340–360 px.

Structure:

- ActiLens + connection state;
- current page/tracking state;
- pause/resume primary action;
- today's compact summary;
- settings/help link if required.

No gradients or glass surfaces. Connection state uses semantic status tokens.

---

## 16. Iconography

Use one consistent Lucide-style 1.75–2 px stroke system.

Default icon sizes:

- 16 px controls;
- 18 px navigation;
- 20 px standalone;
- 24 px empty states.

Do not mix unrelated filled, outlined and hand-drawn icon languages.

---

## 17. Motion

Motion is functional and short.

```text
fast    120 ms
normal  160 ms
slow    220 ms
```

Use for:

- hover/focus;
- dropdown enter/exit;
- sidebar collapse;
- modal;
- toast.

No bouncing, glowing or decorative looping animations.

Respect `prefers-reduced-motion`.

---

## 18. Accessibility

Release requirements:

- WCAG AA text contrast;
- all controls reachable by keyboard;
- visible `:focus-visible`;
- no action exposed only on hover;
- status conveyed by text/icon in addition to color;
- minimum 36 px interactive target for dense desktop UI;
- labels for all inputs;
- menu/dialog semantics;
- Escape closes popovers/modals;
- destructive confirmation receives initial focus safely, not on destructive button.

---

## 19. Responsive targets

Primary supported sizes:

- 1920×1080;
- 1600×900;
- 1440×900;
- 1366×768;
- 1280×720;
- minimum admin width: 1024 px.

Behavior:

- >=1180: full sidebar;
- <1180: collapsed rail by default;
- tables may horizontally scroll rather than destroy column hierarchy;
- page actions wrap only when required.

Mobile admin is not a v1 design target.

---

## 20. Light/dark parity

Every new component must be reviewed in:

- Light;
- Dark;
- System.

No page-specific hardcoded color override is allowed as a dark-mode fix.

Theme must be expressed through semantic tokens.

---

## 21. Content and localization

RU and EN are equal first-class locales.

Design constraints:

- controls must tolerate Russian strings 25–40% longer than English;
- no fixed widths based only on English text;
- destructive copy must be explicit;
- use human state labels instead of implementation terms.

Examples:

- "Мониторинг включён" rather than raw boolean;
- "12 минут назад" rather than timestamp where context allows;
- "Код установки" remains the user-facing term for enrollment token.

---

## 22. Engineering rules for the rewrite

1. Do not change backend API contracts merely for styling.
2. New pages use shared primitives only.
3. No raw hex values in page components.
4. No new page-specific button/card/input implementations.
5. Avoid inline style for static presentation; use component props/classes/tokens.
6. Dynamic data-driven style is allowed only where needed (charts, progress, dimensions).
7. Legacy CSS is deleted as soon as the last consumer is migrated.
8. New component states require Story/design-fixture coverage in `apps/design` or equivalent static fixtures.
9. Existing RBAC must remain authoritative on the backend.
10. Every migrated page is checked in RU/EN and light/dark before merge.

---

## 23. Migration sequence

### PR A — Foundation

- add Manrope to web-admin;
- new semantic tokens;
- new spacing/type/radius scales;
- create shared primitives;
- toast system;
- remove new code dependence on legacy `.btn/.card/.pill` primitives.

Acceptance:
- component fixture page covers normal/hover/focus/disabled/error states;
- light/dark parity.

### PR B — Application shell

- new sidebar;
- organization switcher;
- simplified header;
- account/preferences menu;
- responsive collapsed rail;
- remove persistent theme/language controls from topbar.

Acceptance:
- no duplicate page headings;
- 1024/1280/1440/1920 reviewed.

### PR C — Employees

- new page header;
- compact employee table;
- row context menu;
- monitoring switch;
- role control;
- enrollment action;
- danger menu/modal.

Acceptance:
- owner/admin/manager permission variants;
- active/idle/offline;
- blocked employee;
- empty/loading/error states.

### PR D — Dashboard

- unified KPI cards;
- team status;
- activity trend;
- top apps;
- recent activity.

### PR E — Employee detail

- new entity header;
- tabs;
- unified range filter;
- report layouts;
- devices.

### PR F — Settings

- section navigation;
- monitoring/privacy/storage/audit/account;
- danger zone;
- standardized forms.

### PR G — Auth / onboarding

- login;
- signup;
- empty organization/new organization flows.

### PR H — Desktop + extension alignment

- shared brand/tokens translated to Tauri UI;
- onboarding/consent;
- extension popup.

### PR I — Cleanup and release QA

- delete legacy CSS/classes;
- remove dead design implementations;
- accessibility pass;
- visual regression fixtures/screenshots;
- RU/EN review;
- light/dark/system review.

---

## 24. Legacy patterns scheduled for removal

During migration, remove:

- duplicate primitive families: `.btn` vs `.actilens-btn`, `.card` vs `.actilens-card`;
- duplicate segmented controls;
- mesh backgrounds from admin application pages;
- glass/backdrop-filter surfaces;
- glowing selected navigation;
- page-level static inline style objects;
- permanent theme/language segmented controls in topbar;
- vertical action stacks inside tables;
- duplicate page titles;
- obsolete design references to removed `docs/*` files.

---

## 25. First implementation target

After this spec is approved, implementation starts with:

**PR A: Design foundation**

and then immediately:

**PR B: Application shell**

No business feature work is mixed into these PRs.

The Employees screen is the first full page migration after the shell.
