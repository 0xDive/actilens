# Chrome Web Store — Listing Copy

## Name

ActiLens

## Summary (max 132 chars)

Workplace web-activity tracking that sends active-tab data only to the local
ActiLens desktop app for local or managed use.

## Category

Workflow & Planning

## Language

English (United States)

## Detailed description

ActiLens helps teams understand how work time is spent while keeping the browser
extension's network access limited to the local ActiLens desktop application.

The extension records the active tab's URL, title and time on page and sends those
records only to the ActiLens desktop app running on the same computer over the
loopback address `127.0.0.1`.

In local-only mode, activity remains on that workstation. In a managed deployment,
the desktop app can synchronize activity to the self-hosted ActiLens backend
configured by the organization. The browser extension itself does not contact that
backend directly.

WHY TEAMS USE IT

- Accurate time-on-task and top-sites breakdowns.
- Local extension-to-desktop communication over `127.0.0.1`.
- Organization-controlled self-hosted backend for managed deployments.
- No advertising SDKs, third-party analytics or tracking pixels.
- Lightweight Manifest V3 service worker.

PRIVACY YOU CAN VERIFY

- The extension only communicates with the ActiLens app on localhost.
- It does not read page body content, form inputs, passwords, cookies or typed
  keystrokes.
- It does not capture screenshots.
- The extension source code is public and can be inspected.

CONSENT & RESPONSIBLE USE

ActiLens is intended for transparent workplace use with the knowledge of the people
using the device and in accordance with the deploying organization's policies and
applicable law.

HOW IT WORKS

1. Install the ActiLens desktop app on the work computer.
2. Add the browser extension.
3. The extension pairs with the local desktop app and reports active-tab activity.
4. If the desktop is enrolled in a managed organization, the desktop may sync that
   activity to the organization's configured ActiLens server.

Privacy Policy:
https://github.com/0xDive/actilens/blob/main/apps/extension/PRIVACY.md
