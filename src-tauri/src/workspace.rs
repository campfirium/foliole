use directories::ProjectDirs;
use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const STORAGE_NAMESPACE: &str = "workspace";
const STORAGE_EXT: &str = "json";

#[cfg_attr(feature = "tauri-command", tauri::command)]
pub fn load_workspace_state(storage_key: String) -> Result<Option<String>, String> {
    let state_path = resolve_workspace_state_path(&storage_key)?;
    match fs::read_to_string(&state_path) {
        Ok(payload) => Ok(Some(payload)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("read workspace state failed: {error}")),
    }
}

#[cfg_attr(feature = "tauri-command", tauri::command)]
pub fn save_workspace_state(storage_key: String, payload: String) -> Result<(), String> {
    let state_path = resolve_workspace_state_path(&storage_key)?;
    backup_existing_workspace_state(&state_path)?;
    fs::write(state_path, payload).map_err(|error| format!("write workspace state failed: {error}"))
}

#[cfg_attr(feature = "tauri-command", tauri::command)]
pub fn clear_workspace_state(storage_key: String) -> Result<(), String> {
    let state_path = resolve_workspace_state_path(&storage_key)?;
    match fs::remove_file(&state_path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("clear workspace state failed: {error}")),
    }
}

fn resolve_workspace_state_path(storage_key: &str) -> Result<PathBuf, String> {
    let sanitized_key = sanitize_storage_key(storage_key)?;
    let project_dirs = ProjectDirs::from("com", "foliole", "Foliole")
        .ok_or_else(|| "resolve project directories failed".to_string())?;
    let storage_dir = project_dirs.data_local_dir().join(STORAGE_NAMESPACE);
    fs::create_dir_all(&storage_dir)
        .map_err(|error| format!("create workspace storage directory failed: {error}"))?;
    Ok(storage_dir.join(format!("{sanitized_key}.{STORAGE_EXT}")))
}

fn sanitize_storage_key(storage_key: &str) -> Result<String, String> {
    let is_valid_len = !storage_key.is_empty() && storage_key.len() <= 128;
    if !is_valid_len {
        return Err("workspace storage key has invalid length".to_string());
    }
    if !storage_key
        .chars()
        .all(|char| char.is_ascii_alphanumeric() || char == '-' || char == '_')
    {
        return Err("workspace storage key contains unsupported characters".to_string());
    }
    Ok(storage_key.to_string())
}

fn backup_existing_workspace_state(state_path: &PathBuf) -> Result<(), String> {
    if !state_path.exists() {
        return Ok(());
    }
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("resolve backup timestamp failed: {error}"))?
        .as_secs();
    let backup_path = state_path.with_extension(format!("{STORAGE_EXT}.bak-{timestamp}"));
    fs::copy(state_path, &backup_path).map_err(|error| format!("backup workspace state failed: {error}"))?;
    Ok(())
}
