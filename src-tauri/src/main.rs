#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::json;
use std::env;
use tauri::webview::PageLoadEvent;
use tauri::WindowEvent;

fn install_boot_panic_hook() {
    std::panic::set_hook(Box::new(|panic_info| {
        let location = panic_info
            .location()
            .map(|loc| format!("{}:{}", loc.file(), loc.line()))
            .unwrap_or_else(|| "unknown".to_string());
        let message = if let Some(value) = panic_info.payload().downcast_ref::<&str>() {
            (*value).to_string()
        } else if let Some(value) = panic_info.payload().downcast_ref::<String>() {
            value.clone()
        } else {
            "non-string panic payload".to_string()
        };

        let payload = json!({
          "source": "panic_hook",
          "location": location,
          "message": message
        });
        let _ = foliole_tauri_core::boot::record_boot_stage("tauri_panic", Some(payload));
    }));
}

fn main() {
    install_boot_panic_hook();
    let startup_payload = json!({
      "source": "tauri_main",
      "boot_session": env::var("FOLIOLE_BOOT_SESSION").ok(),
      "workdir": env::var("FOLIOLE_WORKDIR").ok(),
      "webview2_user_data_folder": env::var("WEBVIEW2_USER_DATA_FOLDER").ok()
    });
    let _ = foliole_tauri_core::boot::record_boot_stage("tauri_main_start", Some(startup_payload));

    let builder = tauri::Builder::default()
        .setup(|app| {
            let payload = json!({
              "source": "tauri_setup",
              "app_name": app.package_info().name,
              "app_version": app.package_info().version.to_string()
            });
            let _ = foliole_tauri_core::boot::record_boot_stage("tauri_setup", Some(payload));
            Ok(())
        })
        .on_page_load(|window, payload| {
            let stage = match payload.event() {
                PageLoadEvent::Started => "tauri_page_load_started",
                PageLoadEvent::Finished => "tauri_page_load",
            };
            let record_payload = json!({
              "source": "tauri_on_page_load",
              "window_label": window.label(),
              "url": payload.url().to_string(),
              "event": format!("{:?}", payload.event())
            });
            let _ = foliole_tauri_core::boot::record_boot_stage(stage, Some(record_payload));
        })
        .on_window_event(|window, event| {
            let (stage, payload) = match event {
                WindowEvent::Focused(focused) => (
                    "tauri_window_focused",
                    json!({ "window_label": window.label(), "focused": focused }),
                ),
                WindowEvent::Destroyed => (
                    "tauri_window_destroyed",
                    json!({ "window_label": window.label() }),
                ),
                WindowEvent::CloseRequested { .. } => (
                    "tauri_window_close_requested",
                    json!({ "window_label": window.label() }),
                ),
                _ => return,
            };
            let _ = foliole_tauri_core::boot::record_boot_stage(stage, Some(payload));
        });
    let builder = foliole_tauri_core::register_tauri_commands(builder);

    builder
        .run(tauri::generate_context!())
        .expect("failed to run Foliole tauri application");
}
