use std::collections::HashSet;

use serde_json::json;
use tauri::menu::{Menu, MenuBuilder, MenuItemKind, SubmenuBuilder};
use tauri::{App, AppHandle, Emitter, Runtime};

const EVENT_APP_MENU_COMMAND: &str = "app://command-menu";

const MENU_COMMAND_IDS: &[&str] = &[
    "workspace.openNotes",
    "workspace.openTrash",
    "workspace.openSettings",
    "workspace.toggleList",
    "editor.toggleDisplayMode",
    "review.startStudyMode",
    "review.revealAnswer",
    "review.gradeAgain",
    "review.gradeHard",
    "review.gradeGood",
    "review.gradeEasy",
    "navigation.goBack",
    "navigation.goForward",
    "navigation.goParent",
];

pub fn install_app_menu<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
    let workspace_menu = SubmenuBuilder::new(app, "Workspace")
        .text("workspace.openNotes", "Open Notes")
        .text("workspace.openTrash", "Open Trash")
        .separator()
        .text("workspace.toggleList", "Toggle Left Panel")
        .text("workspace.openSettings", "Settings")
        .build()?;

    let navigate_menu = SubmenuBuilder::new(app, "Navigate")
        .text("navigation.goBack", "Go Back")
        .text("navigation.goForward", "Go Forward")
        .text("navigation.goParent", "Go to Parent")
        .build()?;

    let review_menu = SubmenuBuilder::new(app, "Review")
        .text("review.startStudyMode", "Start Study Mode")
        .text("review.revealAnswer", "Show Answer")
        .separator()
        .text("review.gradeAgain", "Grade Again (1)")
        .text("review.gradeHard", "Grade Hard (2)")
        .text("review.gradeGood", "Grade Good (3)")
        .text("review.gradeEasy", "Grade Easy (4)")
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .text("editor.toggleDisplayMode", "Toggle Source / Live Preview")
        .build()?;

    let menu: Menu<R> = MenuBuilder::new(app)
        .items(&[&workspace_menu, &navigate_menu, &review_menu, &view_menu])
        .build()?;

    app.set_menu(menu)?;

    app.on_menu_event(|app, event| {
        let command_id = event.id().as_ref();
        if !MENU_COMMAND_IDS.contains(&command_id) {
            return;
        }
        let _ = app.emit(
            EVENT_APP_MENU_COMMAND,
            json!({
              "commandId": command_id
            }),
        );
    });

    Ok(())
}

#[tauri::command]
pub fn sync_app_menu_state<R: Runtime>(
    app: AppHandle<R>,
    enabled_command_ids: Vec<String>,
) -> Result<(), String> {
    let Some(menu) = app.menu() else {
        return Ok(());
    };
    let enabled_set: HashSet<&str> = enabled_command_ids.iter().map(String::as_str).collect();

    for &command_id in MENU_COMMAND_IDS {
        let Some(item) = menu.get(command_id) else {
            continue;
        };
        let enabled = enabled_set.contains(command_id);
        set_item_enabled(item, enabled).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn set_item_enabled<R: Runtime>(item: MenuItemKind<R>, enabled: bool) -> tauri::Result<()> {
    match item {
        MenuItemKind::MenuItem(menu_item) => menu_item.set_enabled(enabled),
        MenuItemKind::Submenu(submenu) => submenu.set_enabled(enabled),
        MenuItemKind::Predefined(_) => Ok(()),
        MenuItemKind::Check(check_item) => check_item.set_enabled(enabled),
        MenuItemKind::Icon(icon_item) => icon_item.set_enabled(enabled),
    }
}
