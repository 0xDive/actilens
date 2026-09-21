//! Menu bar (status bar) item: shows tracking state and offers Start / Stop /
//! Open main UI / Quit. Also the single place pause state is changed, so the tray,
//! the dashboard pill, and the trackers stay in sync.
//!
//! Indicator (glanceable, updated every couple seconds):
//!   🟢 tracking   🟡 idle (present, not counting active time)   🔴 paused

use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

use crate::settings::SettingsState;
use crate::trackers::TrackerControl;

const TRAY_ID: &str = "main";

/// Handles to the menu items, so we can enable/disable (start/stop) and relabel
/// them (on a language change). Managed in Tauri state.
struct MenuItems {
    open: MenuItem<tauri::Wry>,
    web: MenuItem<tauri::Wry>,
    sync: MenuItem<tauri::Wry>,
    tracking: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

/// True while the user is on the welcome/login/onboarding surfaces (not the
/// dashboard). Start stays disabled there — tracking is resumed by finishing
/// setup, not from the tray. Defaults to true until the UI reports otherwise.
static IN_SETUP: AtomicBool = AtomicBool::new(true);

/// The active UI locale persisted in settings (defaults to "en" if unavailable).
fn current_locale(app: &AppHandle) -> String {
    app.try_state::<Arc<SettingsState>>()
        .map(|s| s.current.lock().unwrap().locale.clone())
        .unwrap_or_else(|| "en".into())
}

/// Localized native (tray) strings. Brand name stays verbatim. Falls back to
/// English for any unknown locale.
fn tr(locale: &str, key: &str) -> String {
    let s = |en: &str,
             zh: &str,
             ja: &str,
             vi: &str,
             id: &str,
             fr: &str,
             es: &str,
             ru: &str|
     -> String {
        match locale {
            "ru" => ru,
            "zh" => zh,
            "ja" => ja,
            "vi" => vi,
            "id" => id,
            "fr" => fr,
            "es" => es,
            _ => en,
        }
        .to_string()
    };
    match key {
        "open" => s(
            "Open main UI",
            "打开主界面",
            "メイン画面を開く",
            "Mở giao diện chính",
            "Buka antarmuka utama",
            "Ouvrir l'interface",
            "Abrir la interfaz",
            "Открыть главное окно",
        ),
        "web" => s(
            "Open web dashboard",
            "打开网页控制台",
            "Web ダッシュボードを開く",
            "Mở bảng điều khiển web",
            "Buka dasbor web",
            "Ouvrir le tableau de bord web",
            "Abrir panel web",
            "Открыть веб-панель",
        ),
        "sync" => s(
            "Sync",
            "同步",
            "同期",
            "Đồng bộ",
            "Sinkronisasi",
            "Synchronisation",
            "Sincronización",
            "Синхронизация",
        ),
        "sync_synced" => s(
            "synced",
            "已同步",
            "同期済み",
            "đã đồng bộ",
            "tersinkron",
            "synchronisé",
            "sincronizado",
            "синхронизировано",
        ),
        "sync_syncing" => s(
            "syncing…",
            "同步中…",
            "同期中…",
            "đang đồng bộ…",
            "menyinkronkan…",
            "synchronisation…",
            "sincronizando…",
            "синхронизация…",
        ),
        "sync_waiting" => s(
            "waiting",
            "等待中",
            "待機中",
            "đang chờ",
            "menunggu",
            "en attente",
            "en espera",
            "ожидание",
        ),
        "sync_attention" => s(
            "needs attention",
            "需要注意",
            "要確認",
            "cần chú ý",
            "perlu perhatian",
            "attention requise",
            "requiere atención",
            "требуется внимание",
        ),
        "pause_tracking" => s(
            "Pause tracking",
            "暂停跟踪",
            "トラッキングを一時停止",
            "Tạm dừng theo dõi",
            "Jeda pelacakan",
            "Mettre le suivi en pause",
            "Pausar seguimiento",
            "Приостановить",
        ),
        "resume_tracking" => s(
            "Resume tracking",
            "继续跟踪",
            "トラッキングを再開",
            "Tiếp tục theo dõi",
            "Lanjutkan pelacakan",
            "Reprendre le suivi",
            "Reanudar seguimiento",
            "Продолжить",
        ),
        "managed_tracking" => s(
            "Tracking managed by organization",
            "跟踪由组织管理",
            "トラッキングは組織によって管理されています",
            "Theo dõi do tổ chức quản lý",
            "Pelacakan dikelola organisasi",
            "Suivi géré par l’organisation",
            "Seguimiento gestionado por la organización",
            "Отслеживание управляется организацией",
        ),
        "quit" => s(
            "Quit ActiLens",
            "退出 ActiLens",
            "ActiLens を終了",
            "Thoát ActiLens",
            "Keluar dari ActiLens",
            "Quitter ActiLens",
            "Salir de ActiLens",
            "Выйти из ActiLens",
        ),
        "tip_tracking" => s(
            "tracking",
            "正在跟踪",
            "トラッキング中",
            "đang theo dõi",
            "melacak",
            "suivi en cours",
            "en seguimiento",
            "отслеживание",
        ),
        "tip_idle" => s(
            "idle (not counting)",
            "空闲（未计数）",
            "アイドル（カウントなし）",
            "không hoạt động (không tính)",
            "diam (tidak menghitung)",
            "inactif (pas de comptage)",
            "inactivo (sin contar)",
            "простой (не считается)",
        ),
        "tip_paused" => s(
            "paused",
            "已暂停",
            "一時停止中",
            "đã tạm dừng",
            "dijeda",
            "en pause",
            "en pausa",
            "пауза",
        ),
        _ => key.to_string(),
    }
}

#[derive(Clone, Copy, PartialEq)]
enum State {
    Tracking,
    Idle,
    Paused,
}

impl State {
    fn code(self) -> u8 {
        match self {
            State::Tracking => 0,
            State::Idle => 1,
            State::Paused => 2,
        }
    }
    fn label(self) -> &'static str {
        match self {
            State::Tracking => "tracking",
            State::Idle => "idle",
            State::Paused => "paused",
        }
    }
}

/// Last broadcast state code, so we only emit on change. 255 = "unset".
static LAST_STATE: AtomicU8 = AtomicU8::new(255);

// State-colored menu-bar glyphs (not template images, so the tint shows).
const ICON_TRACKING: &[u8] = include_bytes!("../../icons/tray/tray-tracking.png");
const ICON_IDLE: &[u8] = include_bytes!("../../icons/tray/tray-idle.png");
const ICON_PAUSED: &[u8] = include_bytes!("../../icons/tray/tray-paused.png");

fn icon_for(state: State) -> tauri::image::Image<'static> {
    let bytes = match state {
        State::Tracking => ICON_TRACKING,
        State::Idle => ICON_IDLE,
        State::Paused => ICON_PAUSED,
    };
    tauri::image::Image::from_bytes(bytes).expect("decode tray icon")
}

/// Build the tray icon + menu and start the status updater. Call once during setup.
pub fn build(app: &AppHandle, control: Arc<TrackerControl>) -> tauri::Result<()> {
    let loc = current_locale(app);
    let open = MenuItem::with_id(app, "open", tr(&loc, "open"), true, None::<&str>)?;
    let web = MenuItem::with_id(app, "web", tr(&loc, "web"), false, None::<&str>)?;
    let sync = MenuItem::with_id(
        app,
        "sync",
        format!("{}: {}", tr(&loc, "sync"), tr(&loc, "sync_waiting")),
        false,
        None::<&str>,
    )?;
    // Local/personal mode gets one contextual Pause/Resume action. Managed
    // collection remains server-controlled and renders the item read-only.
    let tracking = MenuItem::with_id(
        app,
        "tracking",
        tr(&loc, "pause_tracking"),
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", tr(&loc, "quit"), true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &web,
            &sync,
            &PredefinedMenuItem::separator(app)?,
            &tracking,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon_for(State::Tracking))
        .icon_as_template(false) // keep our state tint colors
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "web" => {
                show_main(app);
                let _ = app.emit("open-web-dashboard", ());
            }
            "tracking" => {
                let managed = app
                    .try_state::<Arc<TrackerControl>>()
                    .is_some_and(|control| control.managed.load(Ordering::Relaxed));
                if !managed {
                    let paused = app
                        .try_state::<Arc<TrackerControl>>()
                        .is_some_and(|control| control.effective_paused());
                    set_paused(app, !paused);
                }
            },
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    // Keep handles so refresh() can enable/disable Start vs Stop, and relabel() can
    // re-translate all items when the language changes.
    app.manage(MenuItems {
        open,
        web,
        sync,
        tracking,
        quit,
    });

    refresh(app);
    start_status_updater(app.clone(), control);
    Ok(())
}

/// Record whether the user is still in setup (welcome/login/onboarding) and pause
/// tracking accordingly; on the dashboard tracking resumes and Start becomes usable.
pub fn set_in_setup(app: &AppHandle, in_setup: bool) {
    IN_SETUP.store(in_setup, Ordering::Relaxed);
    if let Some(control) = app.try_state::<Arc<TrackerControl>>() {
        control.in_setup.store(in_setup, Ordering::Relaxed);
    }
    refresh(app);
}

/// Show + focus the main window (it may be hidden in menu-bar-only mode).
pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// The single source of truth for changing pause state: updates the trackers, the
/// tray indicator, and notifies the UI via an event.
pub fn set_paused(app: &AppHandle, paused: bool) {
    if let Some(c) = app.try_state::<Arc<TrackerControl>>() {
        // Organization-managed users cannot locally pause or resume policy.
        // The server/membership switch remains authoritative.
        if c.managed.load(Ordering::Relaxed) {
            c.paused.store(false, Ordering::Relaxed);
            refresh(app);
            return;
        }
        if !paused && !c.org_monitoring_enabled.load(Ordering::Relaxed) {
            refresh(app);
            return;
        }
        c.paused.store(paused, Ordering::Relaxed);
    }
    refresh(app); // emits the new tracking-state + updates the badge
}

/// Recompute the current state and update the tray (dispatched to the main thread,
/// since AppKit status-item updates must happen there).
pub fn refresh(app: &AppHandle) {
    let (paused, org_enabled, threshold) = match app.try_state::<Arc<TrackerControl>>() {
        Some(c) => (
            c.effective_paused(),
            c.org_monitoring_enabled.load(Ordering::Relaxed),
            c.idle_threshold_s.load(Ordering::Relaxed) as f64,
        ),
        None => (true, true, 60.0),
    };
    let state = if paused || !org_enabled {
        State::Paused
    } else if crate::platform::idle_seconds() >= threshold {
        State::Idle
    } else {
        State::Tracking
    };

    // Broadcast to the UI only when the state actually changes.
    if LAST_STATE.swap(state.code(), Ordering::Relaxed) != state.code() {
        let _ = app.emit("tracking-state", state.label());
        let _ = app.emit("runtime-state-changed", ());
    }

    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || render(&app2, state));
}

fn render(app: &AppHandle, state: State) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let loc = current_locale(app);
        let word = match state {
            State::Tracking => tr(&loc, "tip_tracking"),
            State::Idle => tr(&loc, "tip_idle"),
            State::Paused => tr(&loc, "tip_paused"),
        };
        let tip = format!("ActiLens — {word}");
        // The glyph's tint conveys the state — no separate dot/badge needed.
        let _ = tray.set_icon(Some(icon_for(state)));
        let _ = tray.set_tooltip(Some(tip));
    }

    // Stop is available only while running (tracking/idle); Start only while
    // paused AND on the dashboard (never from the setup surfaces).
    let paused = state == State::Paused;
    let (org_enabled, managed) = app
        .try_state::<Arc<TrackerControl>>()
        .map(|c| {
            (
                c.org_monitoring_enabled.load(Ordering::Relaxed),
                c.managed.load(Ordering::Relaxed),
            )
        })
        .unwrap_or((true, false));
    if let Some(items) = app.try_state::<MenuItems>() {
        let signed_in = app
            .try_state::<Arc<crate::sync::AuthState>>()
            .is_some_and(|auth| auth.is_logged_in());
        let _ = items.web.set_enabled(signed_in);

        let sync_word = app
            .try_state::<Arc<crate::sync::worker::SyncStatus>>()
            .map(|status| {
                let last_error = status.last_error.lock().unwrap().clone();
                if status.syncing.load(Ordering::Relaxed) {
                    tr(&current_locale(app), "sync_syncing")
                } else if !last_error.is_empty() {
                    tr(&current_locale(app), "sync_attention")
                } else if status.pending.load(Ordering::Relaxed) > 0 {
                    format!(
                        "{} ({})",
                        tr(&current_locale(app), "sync_waiting"),
                        status.pending.load(Ordering::Relaxed)
                    )
                } else if status.last_sync_ts.load(Ordering::Relaxed) > 0 {
                    tr(&current_locale(app), "sync_synced")
                } else {
                    tr(&current_locale(app), "sync_waiting")
                }
            })
            .unwrap_or_else(|| tr(&current_locale(app), "sync_waiting"));
        let _ = items
            .sync
            .set_text(format!("{}: {}", tr(&current_locale(app), "sync"), sync_word));

        if managed {
            let _ = items.tracking.set_text(tr(&current_locale(app), "managed_tracking"));
            let _ = items.tracking.set_enabled(false);
        } else {
            let _ = items.tracking.set_text(if paused {
                tr(&current_locale(app), "resume_tracking")
            } else {
                tr(&current_locale(app), "pause_tracking")
            });
            let _ = items.tracking.set_enabled(
                org_enabled && !IN_SETUP.load(Ordering::Relaxed),
            );
        }
    }
}

/// Re-translate the tray menu items + tooltip to the current locale. Call after a
/// language change.
pub fn relabel(app: &AppHandle) {
    let loc = current_locale(app);
    if let Some(items) = app.try_state::<MenuItems>() {
        let _ = items.open.set_text(tr(&loc, "open"));
        let _ = items.web.set_text(tr(&loc, "web"));
        let managed = app
            .try_state::<Arc<TrackerControl>>()
            .is_some_and(|control| control.managed.load(Ordering::Relaxed));
        let paused = app
            .try_state::<Arc<TrackerControl>>()
            .is_some_and(|control| control.effective_paused());
        let _ = items.tracking.set_text(if managed {
            tr(&loc, "managed_tracking")
        } else if paused {
            tr(&loc, "resume_tracking")
        } else {
            tr(&loc, "pause_tracking")
        });
        let _ = items.quit.set_text(tr(&loc, "quit"));
    }
    refresh(app); // re-renders the localized tooltip
}

fn start_status_updater(app: AppHandle, _control: Arc<TrackerControl>) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(2));
        refresh(&app);
    });
}
