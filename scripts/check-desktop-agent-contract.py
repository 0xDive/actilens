#!/usr/bin/env python3
"""Enforce the Desktop v2 product boundary.

The web application owns organization management and activity/reporting.
Desktop is the operational agent for one computer.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / "apps" / "desktop" / "src"

REQUIRED = [
    DESKTOP / "runtime.tsx",
    DESKTOP / "runtimeTypes.ts",
    DESKTOP / "screens" / "HomeV2.tsx",
    DESKTOP / "screens" / "DeviceV2.tsx",
    DESKTOP / "screens" / "Permissions.tsx",
    DESKTOP / "screens" / "DesktopSettings.tsx",
]

REMOVED_LEGACY_UI = [
    DESKTOP / "screens" / "Dashboard.tsx",
    DESKTOP / "screens" / "Activity.tsx",
    DESKTOP / "screens" / "Screenshots.tsx",
    DESKTOP / "screens" / "Browser.tsx",
    DESKTOP / "screens" / "Settings.tsx",
    DESKTOP / "components" / "AppTrayMenu.tsx",
    DESKTOP / "updater.ts",
]

for path in REQUIRED:
    if not path.is_file():
        raise SystemExit(f"Desktop v2 contract failed: missing {path.relative_to(ROOT)}")

for locale in ("en", "ru", "zh", "ja", "vi", "id", "fr", "es"):
    desktop_locale = DESKTOP / "i18n" / "locales" / locale / "desktop.json"
    if not desktop_locale.is_file():
        raise SystemExit(
            "Desktop v2 contract failed: missing locale "
            f"{desktop_locale.relative_to(ROOT)}"
        )

for path in REMOVED_LEGACY_UI:
    if path.exists():
        raise SystemExit(
            f"Desktop v2 contract failed: legacy web-like UI returned: {path.relative_to(ROOT)}"
        )

app = (DESKTOP / "App.tsx").read_text(encoding="utf-8")
for forbidden in (
    "./screens/Dashboard",
    "./screens/Activity",
    "./screens/Screenshots",
    "./screens/Browser",
    "./screens/Settings",
    "AppTrayMenu",
    "autoCheckAndPrompt",
    "CaptureManaged",
):
    if forbidden in app:
        raise SystemExit(f"Desktop v2 contract failed: App.tsx contains {forbidden!r}")

for required in (
    "RuntimeProvider",
    "./screens/HomeV2",
    "./screens/DeviceV2",
    "./screens/Permissions",
    "./screens/DesktopSettings",
):
    if required not in app:
        raise SystemExit(f"Desktop v2 contract failed: App.tsx missing {required!r}")

settings = (DESKTOP / "screens" / "DesktopSettings.tsx").read_text(encoding="utf-8")
for forbidden in (
    "capture_screenshots",
    "count_keystrokes",
    "collect_app_activity",
    "collect_window_titles",
    "collect_browser_activity",
    "screenshot_interval_s",
    "screenshot_retention_days",
):
    if forbidden in settings:
        raise SystemExit(
            "Desktop v2 contract failed: application Settings exposes "
            f"organization/capture field {forbidden!r}"
        )

windows = (
    ROOT / "apps" / "desktop" / "src-tauri" / "src" / "platform" / "windows.rs"
).read_text(encoding="utf-8")
capability_start = windows.find("pub fn capability_rows")
capability_end = windows.find("pub fn open_settings", capability_start)
if capability_start < 0 or capability_end < 0:
    raise SystemExit("Desktop v2 contract failed: Windows capability_rows not found")
capability_body = windows[capability_start:capability_end]
if "Vec::new()" not in capability_body:
    raise SystemExit(
        "Desktop v2 contract failed: Windows Permissions must not expose capture policy rows"
    )
for forbidden in ("Screenshots", "keystroke", "count_keystrokes", "capture_screenshots"):
    if forbidden in capability_body:
        raise SystemExit(
            f"Desktop v2 contract failed: Windows permission row leaks {forbidden!r}"
        )

commands = (
    ROOT / "apps" / "desktop" / "src-tauri" / "src" / "commands" / "mod.rs"
).read_text(encoding="utf-8")
for required in (
    "pub fn runtime_state",
    "pub async fn runtime_diagnostics",
    "pub fn local_storage_summary",
    "pub fn web_dashboard_url",
):
    if required not in commands:
        raise SystemExit(f"Desktop v2 contract failed: native runtime missing {required!r}")

lib_rs = (
    ROOT / "apps" / "desktop" / "src-tauri" / "src" / "lib.rs"
).read_text(encoding="utf-8")
for forbidden_command in (
    "commands::dashboard_data",
    "commands::keystroke_buckets",
    "commands::screenshot_list",
    "commands::browser_visits",
    "commands::export_csv",
    "commands::export_json",
    "commands::capture_now",
    "commands::browser_link",
    "commands::sync_status",
    "commands::capture_policy",
    "commands::privacy_apps",
):
    if forbidden_command in lib_rs:
        raise SystemExit(
            "Desktop v2 contract failed: legacy webview command is registered: "
            f"{forbidden_command}"
        )

print("ActiLens Desktop v2 agent contract: OK")
