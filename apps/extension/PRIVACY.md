# Privacy Policy — ActiLens Browser Extension

**Last updated: September 18, 2026**

This policy explains how the ActiLens browser extension handles information. It
applies to the Chrome and Microsoft Edge versions of the extension.

## Summary

- The extension observes the active browser tab so it can measure time on page.
- The extension communicates only with the ActiLens desktop application on the
  same computer through the loopback address `127.0.0.1`.
- The extension does not send data directly to the ActiLens developer/publisher,
  advertising services, analytics providers or arbitrary internet endpoints.
- In managed ActiLens deployments, the desktop application may subsequently sync
  browser activity to the ActiLens backend configured by the deploying
  organization.
- The deploying organization controls that backend and is responsible for its
  access, retention and legal/compliance policies.

## Information handled

For each completed active-tab visit, the extension can provide the local desktop
application with:

- page URL;
- page title;
- visit start time;
- active duration/time on page;
- browser name.

The extension does not read page body content, form inputs, passwords, cookies or
typed keystrokes, and it does not capture screenshots.

## How information moves

The extension posts browser-activity records only to the ActiLens desktop
application on the same device using `http://127.0.0.1`. The loopback interface is
local to the computer and is not a remote service.

What happens after that depends on how the desktop application is configured:

- in local-only mode, activity remains on the workstation;
- in managed mode, the desktop application can synchronize the activity to the
  self-hosted ActiLens backend selected by the deploying organization.

The extension itself does not choose that backend and does not contact it directly.

## Local extension storage

The extension stores only operational values in browser local storage, such as the
local desktop port/pairing token, pause state and small counters used by the
extension. These values are used to communicate with the local desktop app.

## Developer/publisher data collection

The extension contains no advertising SDK, analytics SDK, tracking pixel or
third-party telemetry integration. The extension does not directly transmit
browsing activity to the ActiLens developer/publisher.

An organization that operates an ActiLens backend may receive activity synchronized
by its managed desktop clients. That organization, rather than the browser
extension, determines who can access the backend and how long data is retained.

## Permissions

- **`tabs`** — reads the active tab URL and title for the activity record.
- **`storage`** — stores local pairing and extension settings.
- **`alarms`** — periodically checks/re-establishes the local desktop connection.
- **`host_permissions: http://127.0.0.1/*`** — sends records to the ActiLens
  desktop application running on the same computer.

## Consent and intended use

ActiLens is intended for transparent workplace use with appropriate notice and
consent where required. Organizations deploying ActiLens are responsible for their
monitoring policies, user notices, lawful basis/consent requirements, access
controls and retention practices under applicable law.

## Children

The extension is a workplace tool and is not directed to children.

## Source code

The extension source is included in the public ActiLens repository so its network
behavior and permissions can be reviewed.

## Changes to this policy

Material changes will be reflected in this document together with an updated
revision date.

## Contact

For project/privacy questions, use the contact channels published in the ActiLens
repository.
