use directories::ProjectDirs;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct AppPaths {
    pub app_data_dir: String,
    pub app_config_dir: String,
    pub app_cache_dir: String,
    pub app_log_dir: String,
}

#[cfg_attr(feature = "tauri-command", tauri::command)]
pub fn resolve_app_paths() -> Result<AppPaths, String> {
    let project_dirs = ProjectDirs::from("com", "foliole", "Foliole")
        .ok_or_else(|| "resolve project directories failed".to_string())?;

    let app_data_dir = project_dirs.data_local_dir().to_path_buf();
    let app_config_dir = project_dirs.config_dir().to_path_buf();
    let app_cache_dir = project_dirs.cache_dir().to_path_buf();
    let app_log_dir = derive_log_dir(&project_dirs);

    Ok(AppPaths {
        app_data_dir: path_to_string(app_data_dir),
        app_config_dir: path_to_string(app_config_dir),
        app_cache_dir: path_to_string(app_cache_dir),
        app_log_dir: path_to_string(app_log_dir),
    })
}

fn derive_log_dir(project_dirs: &ProjectDirs) -> PathBuf {
    if let Some(state_dir) = project_dirs.state_dir() {
        return state_dir.to_path_buf();
    }
    project_dirs.data_local_dir().join("logs")
}

fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}
