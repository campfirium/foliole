#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::json;
use tauri::{PageLoadEvent, WindowEvent};

fn main() {
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
