#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let builder = tauri::Builder::default();
    let builder = foliole_tauri_core::register_tauri_commands(builder);

    builder
        .run(tauri::generate_context!())
        .expect("failed to run Foliole tauri application");
}
