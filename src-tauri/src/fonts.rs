use std::collections::BTreeSet;
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct SystemFontCatalog {
    pub fonts: Vec<String>,
    pub monospace_fonts: Vec<String>,
}

#[cfg_attr(feature = "tauri-command", tauri::command)]
pub fn list_system_fonts() -> SystemFontCatalog {
    let mut database = fontdb::Database::new();
    database.load_system_fonts();

    let mut all_names = BTreeSet::new();
    let mut monospace_names = BTreeSet::new();
    for face in database.faces() {
        for (name, _) in &face.families {
            if !name.trim().is_empty() {
                all_names.insert(name.to_string());
                if face.monospaced {
                    monospace_names.insert(name.to_string());
                }
            }
        }
        if !face.post_script_name.trim().is_empty() {
            all_names.insert(face.post_script_name.to_string());
            if face.monospaced {
                monospace_names.insert(face.post_script_name.to_string());
            }
        }
    }

    SystemFontCatalog {
        fonts: all_names.into_iter().collect(),
        monospace_fonts: monospace_names.into_iter().collect(),
    }
}
