//! Windows platform backend (see docs/12-windows-support-plan.md §3).
//!
//! Selected by `#[cfg(target_os = "windows")]` in `platform/mod.rs`, which
//! re-exports everything below. Windows has no per-feature OS permission prompts.
//! The desktop Permissions screen therefore reports no additional OS permissions
//! instead of exposing collection policy as if it were a system capability.
//!
//! Implemented now (M1): idle detection via `GetLastInputInfo`. Active window and
//! screenshots are cross-platform (`active-win-pos-rs` / `xcap`) and live elsewhere.
//! Keyboard counting (M2) is stubbed — see `run_keyboard_tap`.

use super::{CapabilityRow, Permission, PermissionState};
use crate::settings::Settings;

/// Windows does not expose macOS-style per-feature OS permissions for the
/// capabilities ActiLens uses. Collection choices are policy/runtime concerns and
/// must not be surfaced in the Permissions UI.
pub fn capability_rows(_s: &Settings) -> Vec<CapabilityRow> {
    Vec::new()
}

/// No-op on Windows: there is no System Settings pane to grant a per-feature
/// permission. Opt-outs live in the app's own Settings screen.
pub fn open_settings(_p: Permission) {}

/// Windows has no per-feature OS permission model — everything is available
/// unless the user opts out in-app, so report `Granted`.
pub fn permission_status(_p: Permission) -> PermissionState {
    PermissionState::Granted
}

/// No OS prompt to request on Windows; capture works unless opted out in-app.
pub fn request_screen_recording() -> bool {
    true
}

/// No OS prompt to request on Windows.
pub fn request_input_monitoring() -> bool {
    true
}

/// No OS prompt to request on Windows.
pub fn request_accessibility() -> bool {
    true
}

/// Low-level keyboard hook callback. Runs on the thread that installed the hook
/// (see `run_keyboard_tap`). COUNT ONLY — we increment on key-down and never read
/// the key code / scan code from `lparam`, preserving the same privacy guarantee
/// as the macOS event tap.
unsafe extern "system" fn keyboard_hook_proc(
    code: i32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use std::sync::atomic::Ordering;
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, HC_ACTION, HHOOK, WM_KEYDOWN, WM_SYSKEYDOWN,
    };

    // Only act on HC_ACTION; anything < 0 must be passed straight through.
    if code == HC_ACTION as i32 {
        let msg = wparam.0 as u32;
        if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
            super::KEY_PRESS_COUNT.fetch_add(1, Ordering::Relaxed);
        }
    }
    // hhk is ignored by the OS; pass a null handle.
    CallNextHookEx(HHOOK::default(), code, wparam, lparam)
}

/// Install a `WH_KEYBOARD_LL` low-level keyboard hook and pump messages so it
/// fires (low-level hooks are delivered to the installing thread's message queue).
/// Blocks while active; the caller (`trackers::start_keyboard`) runs this on a
/// dedicated thread in a retry loop. Returns `false` immediately if the hook can't
/// be installed, so the caller idles and retries instead of busy-looping.
///
/// Note (see plan §8): a low-level hook cannot observe input routed to a
/// higher-integrity/elevated foreground app — counts simply pause for that window;
/// the app never crashes.
pub fn run_keyboard_tap() -> bool {
    use windows::Win32::Foundation::HINSTANCE;
    use windows::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx,
        MSG, WH_KEYBOARD_LL,
    };

    unsafe {
        // hMod = NULL is permitted for WH_KEYBOARD_LL; the proc lives in-process.
        let hook = match SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(keyboard_hook_proc),
            HINSTANCE::default(),
            0,
        ) {
            Ok(h) => h,
            Err(_) => return false,
        };

        // Message loop: GetMessageW blocks and lets the system deliver hook
        // callbacks on this thread. We never post WM_QUIT, so this runs until the
        // process exits; on the unexpected `0`/`-1` return we fall through and
        // unhook so the caller can retry.
        let mut msg = MSG::default();
        loop {
            let r = GetMessageW(&mut msg, None, 0, 0).0;
            if r == 0 || r == -1 {
                break;
            }
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        let _ = UnhookWindowsHookEx(hook);
    }
    true
}

fn gamepad_activity_now() -> bool {
    use std::sync::{Mutex, OnceLock};
    use windows::Win32::UI::Input::XboxController::{XInputGetState, XINPUT_STATE};

    // Packet numbers let us notice short controller interactions that happened
    // between polls. We never retain buttons, axes or any input contents.
    static PACKETS: OnceLock<Mutex<[u32; 4]>> = OnceLock::new();
    let packets = PACKETS.get_or_init(|| Mutex::new([0; 4]));
    let mut packets = packets.lock().unwrap();
    let mut active = false;

    for index in 0..4u32 {
        let mut state = XINPUT_STATE::default();
        let result = unsafe { XInputGetState(index, &mut state) };
        if result.0 != 0 {
            packets[index as usize] = 0;
            continue;
        }

        let previous = packets[index as usize];
        if previous != 0 && previous != state.dwPacketNumber {
            active = true;
        }
        packets[index as usize] = state.dwPacketNumber;

        // Treat a meaningfully engaged control as ongoing activity. Standard
        // XInput deadzones avoid common analogue-stick drift keeping a machine
        // permanently active.
        let pad = state.Gamepad;
        let stick_active =
            i32::from(pad.sThumbLX).abs() > 7849
                || i32::from(pad.sThumbLY).abs() > 7849
                || i32::from(pad.sThumbRX).abs() > 8689
                || i32::from(pad.sThumbRY).abs() > 8689;
        if pad.wButtons != 0
            || pad.bLeftTrigger > 30
            || pad.bRightTrigger > 30
            || stick_active
        {
            active = true;
        }
    }

    active
}

/// Seconds since the last user interaction. Keyboard/mouse idle comes from
/// `GetLastInputInfo`; XInput controller activity is folded in separately so
/// controller-driven games do not become false idle time. No input contents are
/// persisted.
pub fn idle_seconds() -> f64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    use windows::Win32::System::SystemInformation::{GetTickCount, GetTickCount64};
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    static LAST_GAMEPAD_INPUT_MS: AtomicU64 = AtomicU64::new(0);

    let mut info = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };

    unsafe {
        let now64 = GetTickCount64();
        if gamepad_activity_now() {
            LAST_GAMEPAD_INPUT_MS.store(now64, Ordering::Relaxed);
        }

        let keyboard_mouse_idle = if GetLastInputInfo(&mut info).as_bool() {
            // Both are 32-bit millisecond tick counts that wrap ~every 49 days;
            // wrapping_sub gives the correct elapsed interval across a wrap.
            GetTickCount().wrapping_sub(info.dwTime) as f64 / 1000.0
        } else {
            0.0
        };

        let gamepad_last = LAST_GAMEPAD_INPUT_MS.load(Ordering::Relaxed);
        if gamepad_last == 0 {
            keyboard_mouse_idle
        } else {
            let gamepad_idle = now64.saturating_sub(gamepad_last) as f64 / 1000.0;
            keyboard_mouse_idle.min(gamepad_idle)
        }
    }
}
