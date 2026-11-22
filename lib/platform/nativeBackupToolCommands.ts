/** Tools that work on backups and other libraries beside the open one. */
export const NATIVE_BACKUP_TOOL_COMMANDS = {
  startBackupSearch: 'start_backup_search',
  nextBackupSearch: 'next_backup_search',
  cancelBackupSearch: 'cancel_backup_search',
  pickLibraryMergeSource: 'pick_library_merge_source',
  pickLibraryMergeAttachments: 'pick_library_merge_attachments',
  mergeLibrary: 'merge_library'
} as const;
