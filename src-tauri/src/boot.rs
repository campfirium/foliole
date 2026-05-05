use chrono::Utc;
use serde_json::{json, Value};
use std::env;
use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

const BOOT_EVENT_LOG: &str = "logs/windows/native-boot-events.ndjson";
const READY_MARKER_FILE: &str = ".windows-native-boot-ready.json";

fn resolve_repo_root() -> PathBuf {
    if let Ok(workdir) = env::var("FOLIOLE_WORKDIR") {
        let path = PathBuf::from(workdir);
        if path.join("package.json").exists() {
            return path;
        }
    }

    if let Ok(exe_path) = env::current_exe() {
        for ancestor in exe_path.ancestors() {
            if ancestor.join("package.json").exists() {
                return ancestor.to_path_buf();
            }
        }
    }

    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn append_json_line(path: &Path, payload: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        create_dir_all(parent).map_err(|err| format!("create log dir failed: {err}"))?;
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|err| format!("open log file failed: {err}"))?;

    let line = serde_json::to_string(payload).map_err(|err| format!("encode json failed: {err}"))?;
    writeln!(file, "{line}").map_err(|err| format!("write log failed: {err}"))?;
    Ok(())
}

fn write_json_file(path: &Path, payload: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        create_dir_all(parent).map_err(|err| format!("create ready dir failed: {err}"))?;
    }

    let bytes = serde_json::to_vec_pretty(payload).map_err(|err| format!("encode ready json failed: {err}"))?;
    std::fs::write(path, bytes).map_err(|err| format!("write ready marker failed: {err}"))
}

#[cfg_attr(feature = "tauri-command", tauri::command)]
pub fn boot_report(stage: String, payload: Option<Value>) -> Result<(), String> {
    record_boot_stage(&stage, payload)
}

pub fn record_boot_stage(stage: &str, payload: Option<Value>) -> Result<(), String> {
    let repo_root = resolve_repo_root();
    let event_log_path = repo_root.join(BOOT_EVENT_LOG);
    let ready_marker_path = repo_root.join(READY_MARKER_FILE);
    let timestamp = Utc::now().to_rfc3339();
    let pid = std::process::id();
    let session = env::var("FOLIOLE_BOOT_SESSION")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let event = json!({
      "timestamp": timestamp,
      "stage": stage,
      "pid": pid,
      "session": session,
      "payload": payload
    });
    append_json_line(&event_log_path, &event)?;

    if stage == "app_ready" {
        write_json_file(&ready_marker_path, &event)?;
    }

    Ok(())
}
