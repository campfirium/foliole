pub mod boot;
pub mod fonts;
pub mod menu;
pub mod opener;
pub mod paths;
pub mod review;
pub mod workspace;

#[cfg(feature = "tauri-command")]
pub fn register_tauri_commands<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        boot::boot_report,
        fonts::list_system_fonts,
        opener::open_external_url,
        paths::resolve_app_paths,
        menu::sync_app_menu_state,
        review::review_grade,
        workspace::load_workspace_state,
        workspace::save_workspace_state,
        workspace::clear_workspace_state
    ])
}
