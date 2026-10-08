export type SettingScope = 'host' | 'local_only' | 'session_resume' | 'user_space';
export type DataRecovery = 'saved' | 'regenerated';

interface SettingPolicyGroup {
  keys: readonly string[];
  scope: SettingScope;
  recovery: DataRecovery;
}

// Policies describe setting kinds; individual records retain their existing owner identity.
const groups: readonly SettingPolicyGroup[] = [
  { scope: 'user_space', recovery: 'saved', keys: [
    'readwise_active_host', 'readwise_remote_source', 'readwise_source_mode',
    'readwise_source_mode_conflict', 'readwise_source_cutover', 'readwise_source_cutover_v2',
    'review_scheduler_settings', 'search_aliases_document', 'system_entry_display_names'
  ] },
  { scope: 'host', recovery: 'saved', keys: [
    'app_settings', 'backup_settings', 'import_manager_settings', 'library_path_settings',
    'readwise_api_import_state', 'discourse_publish_settings', 'foliole_publish_settings',
    'readwise_import_settings', 'wordpress_publish_settings'
  ] },
  { scope: 'session_resume', recovery: 'saved', keys: ['readwise_book_epub_picker_state', 'window_state'] },
  { scope: 'local_only', recovery: 'saved', keys: [
    'host_name', 'device_id', 'desktop_device_id', 'foliole_aide_byok_settings',
    'remote-image-learned-sources-v1', 'readwise_books_inventory_state', 'watch_import_cursor_state'
  ] },
  { scope: 'local_only', recovery: 'regenerated', keys: [
    'backup_restore_pending_sync', 'sync_group_last_trigger_result', 'sync_group_activity'
  ] }
];

export const OVERWRITE_SOURCE_SETTING_KEYS = [
  'import_manager_settings', 'readwise_import_settings', 'readwise_api_import_state',
  'readwise_books_inventory_state', 'readwise_book_epub_picker_state', 'watch_import_cursor_state'
] as const;

export const DECLARED_SETTING_KEYS = groups.flatMap((group) => group.keys).sort();
export const WORKSPACE_SETTING_KEYS = groups.filter((group) => group.scope === 'user_space')
  .flatMap((group) => group.keys);

export function resolveSettingDataPolicy(key: string) {
  const group = groups.find((candidate) => candidate.keys.includes(key));
  return { declared: Boolean(group), scope: group?.scope ?? 'host',
    ownership: group?.scope === 'user_space' ? 'workspace' as const : 'device' as const,
    recovery: group?.recovery ?? 'saved' };
}

export function isWorkspaceSettingObject(objectId: string) {
  const [scope, platform, formFactor, hostName, key, ...extra] = objectId.split(':');
  return Boolean(scope === 'user_space' && platform && formFactor && hostName === '*' && key &&
    !extra.length && resolveSettingDataPolicy(key).ownership === 'workspace');
}
