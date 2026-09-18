# ActiLens design fixtures

This package is the runnable fixture gallery for **ActiLens Design System v1**.

It is not a second product implementation and does not contain mocked versions of
the dashboard or desktop application. Its purpose is to keep the shared visual
language reviewable and buildable in isolation.

## What it covers

The gallery currently exercises:

- semantic light/dark color tokens;
- primary, secondary, ghost, danger and disabled buttons;
- semantic badges/statuses;
- fields and validation states;
- switches;
- compact employee-table density;
- destructive confirmation flow.

The product specification lives in the repository root:

```text
DESIGN_SPEC_V1.md
```

## Run

From the repository root:

```bash
corepack enable
pnpm install
pnpm --filter @actilens/design dev
```

Build/typecheck:

```bash
pnpm --filter @actilens/design typecheck
pnpm --filter @actilens/design build
```

Both commands are part of CI so the design fixture cannot silently drift into a
broken state.

## Rules

- Fixtures describe the current v1 system, not legacy mockups.
- New web-admin work uses the production `ds-*` primitives and semantic tokens.
- The fixture package may use simplified local fixture components, but its colors,
  geometry and states must match `DESIGN_SPEC_V1.md`.
- Do not add fake analytics or product behavior to this package.
