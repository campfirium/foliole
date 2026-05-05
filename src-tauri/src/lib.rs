pub mod boot;
pub mod fonts;
pub mod opener;
pub mod review;

#[cfg(feature = "tauri-command")]
pub fn register_tauri_commands<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        boot::boot_report,
        fonts::list_system_fonts,
        opener::open_external_url,
        review::review_grade
    ])
}
