export const NATIVE_COMMANDS = {
  appGetVersion: 'app_get_version',
  bootReport: 'boot_report',
  listSystemFonts: 'list_system_fonts',
  openExternalUrl: 'open_external_url',
  loadImportOverview: 'load_import_overview',
  loadImportManagerSettings: 'load_import_manager_settings',
  runDirectoryImport: 'run_directory_import',
  runTextFileImport: 'run_text_file_import',
  selectImportDirectory: 'select_import_directory',
  selectImportTextFile: 'select_import_text_file',
  resolveAppPaths: 'resolve_app_paths',
  reviewGrade: 'review_grade',
  reviewPreview: 'review_preview',
  syncAppMenuState: 'sync_app_menu_state',
  windowClose: 'window_close',
  windowIsMaximized: 'window_is_maximized',
  windowMinimize: 'window_minimize',
  windowRestartApp: 'window_restart_app',
  windowToggleDevTools: 'window_toggle_dev_tools',
  windowToggleMaximize: 'window_toggle_maximize',
  loadWorkspaceSnapshot: 'load_workspace_snapshot',
  loadAppSettingsState: 'load_app_settings_state',
  saveAppSettingsState: 'save_app_settings_state',
  saveImportManagerSettings: 'save_import_manager_settings',
  loadReviewSchedulerSettings: 'load_review_scheduler_settings',
  saveReviewSchedulerSettings: 'save_review_scheduler_settings',
  loadReadingProgress: 'load_reading_progress',
  saveReadingProgress: 'save_reading_progress',
  listSqliteBackups: 'list_sqlite_backups',
  backupSqliteDatabase: 'backup_sqlite_database',
  restoreSqliteDatabase: 'restore_sqlite_database',
  updateNodeContent: 'update_node_content',
  updateNodeReveal: 'update_node_reveal',
  relearnNode: 'relearn_node',
  replaceNodeOrder: 'replace_node_order',
  softDeleteNodes: 'soft_delete_nodes',
  restoreNodes: 'restore_nodes',
  deleteNodesPermanently: 'delete_nodes_permanently',
  applyReviewGrade: 'apply_review_grade'
} as const;

export type NativeCommandName = (typeof NATIVE_COMMANDS)[keyof typeof NATIVE_COMMANDS];

const NATIVE_COMMAND_SET = new Set<string>(Object.values(NATIVE_COMMANDS));

export function isTypedNativeCommand(command: string): command is NativeCommandName {
  return NATIVE_COMMAND_SET.has(command);
}
