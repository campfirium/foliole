use std::process::Command;

#[cfg_attr(feature = "tauri-command", tauri::command)]
pub fn open_external_url(url: String) -> Result<(), String> {
    let target = url.trim();
    if target.is_empty() {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", target])
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(target)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("unsupported platform for external url opener".to_string())
}
