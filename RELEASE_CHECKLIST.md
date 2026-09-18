# ActiLens v0.2 release checklist

This checklist defines the release gate for the first validated v0.2 release.
Until the release candidate passes it, avoid large product features and focus on
correctness, security, deployment, testing and documentation.

## Automated gates

- [ ] PostgreSQL integration tests pass.
- [ ] Backend unit tests and build pass.
- [ ] Web-admin typecheck and production build pass.
- [ ] Desktop TypeScript typecheck passes.
- [ ] Desktop Rust unit tests pass on the Windows production target.
- [ ] Windows MSI and EXE build successfully.
- [ ] Linux deployment scripts and Docker Compose configuration validate.
- [ ] `Cargo.lock` is synchronized with `Cargo.toml` and Rust CI can run with
      `--locked`.

## Linux acceptance

- [ ] Install on a clean Linux host with `install-linux.sh`.
- [ ] Confirm `/healthz` and the admin console are reachable.
- [ ] Create an owner and organization.
- [ ] Run `actilensctl.sh backup`.
- [ ] Restore that backup on a disposable deployment and verify the application
      returns healthy with the expected data.

## Windows acceptance

- [ ] Publish `v0.2.0-rc.1` through the **ActiLens Release** workflow.
- [ ] Download the MSI, EXE and provisioning script from the GitHub Release itself.
- [ ] Create an employee and one-time enrollment code in the admin console.
- [ ] Provision a clean Windows user with `install-windows-agent.ps1`.
- [ ] Confirm the visible tray/onboarding/consent flow.
- [ ] Confirm activity and active/idle data sync.
- [ ] Confirm screenshot capture/upload/reporting according to policy.
- [ ] Install the browser extension and confirm browser activity reporting.
- [ ] Disable organization monitoring and confirm collection/upload stops.
- [ ] Restart while monitoring is disabled and confirm the client remains fail-closed.
- [ ] Re-enable monitoring and confirm collection resumes.
- [ ] Revoke and restore the device and confirm sync behavior.
- [ ] Permanently purge the test member and confirm only the selected organization's
      monitoring data is removed while audit history is retained.

## Release artifacts

- [ ] Confirm release asset names are exactly:
      `ActiLens-x64.msi`, `ActiLens-x64-setup.exe`,
      `install-windows-agent.ps1`.
- [ ] Confirm `ghcr.io/0xdive/actilens:v0.2.0-rc.1` can be deployed cleanly.
- [ ] Review generated release notes.
- [ ] Publish `v0.2.0` only after the release candidate passes.

## Repository hygiene

- [ ] Protect `main` with the stable required CI checks.
- [ ] Remove stale merged feature branches.
- [ ] Keep release/deployment/privacy documentation aligned with actual behavior.
