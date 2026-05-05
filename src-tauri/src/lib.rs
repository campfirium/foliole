pub mod boot;
pub mod review;

#[cfg(feature = "tauri-command")]
pub fn register_tauri_commands<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder.invoke_handler(tauri::generate_handler![boot::boot_report, review::review_grade])
}
