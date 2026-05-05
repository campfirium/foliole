#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::json;

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
            let payload = json!({
              "source": "tauri_on_page_load",
              "window_label": window.label(),
              "url": payload.url().to_string()
            });
            let _ = foliole_tauri_core::boot::record_boot_stage("app_ready", Some(payload));
        });
    let builder = foliole_tauri_core::register_tauri_commands(builder);

    builder
        .run(tauri::generate_context!())
        .expect("failed to run Foliole tauri application");
}
