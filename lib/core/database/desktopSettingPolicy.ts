export type DesktopSettingScope = 'device' | 'local_only' | 'session_resume' | 'user_space';

export const DESKTOP_SETTING_PLATFORM = 'windows';
export const DESKTOP_SETTING_FORM_FACTOR = 'desktop';

const USER_SPACE_KEYS = new Set([
  'app_settings',
  'backup_settings',
  'import_manager_settings',
  'library_path_settings',
  'readwise_active_installation',
  'review_scheduler_settings'
]);
const SESSION_RESUME_KEYS = new Set(['readwise_book_epub_picker_state', 'window_state']);
const LOCAL_ONLY_KEYS = new Set([
  'device_id',
  'desktop_device_id',
  'remote-image-learned-sources-v1',
  'readwise_books_inventory_state',
  'watch_import_cursor_state'
]);
const DEVICE_KEYS = new Set([
  'discourse_publish_settings',
  'foliole_publish_settings',
  'readwise_device_settings',
  'wordpress_publish_settings'
]);

export const DESKTOP_DECLARED_SETTING_KEYS = [
  ...USER_SPACE_KEYS,
  ...SESSION_RESUME_KEYS,
  ...LOCAL_ONLY_KEYS,
  ...DEVICE_KEYS
].sort();

export const DESKTOP_INTERNAL_SETTINGS_KEYS = [
  'desktop_node_sync_restore_incarnation',
  'desktop_node_sync_version_counter',
  'workspace_search_queued_revision',
  'workspace_search_source_identity',
  'workspace_search_source_revision'
] as const;

export interface DesktopSettingPolicy {
  canonical: boolean;
  declared: boolean;
  scope: DesktopSettingScope;
}

export interface DesktopSettingIdentity {
  deviceId: string;
  formFactor: string;
  key: string;
  objectId: string;
  platform: string;
  scope: Exclude<DesktopSettingScope, 'local_only'>;
}

export function resolveDesktopSettingPolicy(key: string): DesktopSettingPolicy {
  if (LOCAL_ONLY_KEYS.has(key)) return { canonical: false, declared: true, scope: 'local_only' };
  if (USER_SPACE_KEYS.has(key)) return { canonical: true, declared: true, scope: 'user_space' };
  if (SESSION_RESUME_KEYS.has(key)) return { canonical: true, declared: true, scope: 'session_resume' };
  if (DEVICE_KEYS.has(key)) return { canonical: true, declared: true, scope: 'device' };
  return { canonical: true, declared: false, scope: 'device' };
}

export function resolveDesktopSettingIdentity(key: string, currentDeviceId: string | null): DesktopSettingIdentity | null {
  const policy = resolveDesktopSettingPolicy(key);
  if (!policy.canonical || policy.scope === 'local_only') return null;
  const deviceId = policy.scope === 'user_space' ? '*' : currentDeviceId?.trim();
  if (!deviceId) return null;
  return {
    deviceId,
    formFactor: DESKTOP_SETTING_FORM_FACTOR,
    key,
    objectId: `${policy.scope}:${DESKTOP_SETTING_PLATFORM}:${DESKTOP_SETTING_FORM_FACTOR}:${deviceId}:${key}`,
    platform: DESKTOP_SETTING_PLATFORM,
    scope: policy.scope
  };
}

export function canMaterializeDesktopSetting(
  identity: Omit<DesktopSettingIdentity, 'objectId'>,
  currentDeviceId: string | null
) {
  const policy = resolveDesktopSettingPolicy(identity.key);
  if (!policy.declared || !policy.canonical || policy.scope !== identity.scope) return false;
  if (identity.platform !== DESKTOP_SETTING_PLATFORM || identity.formFactor !== DESKTOP_SETTING_FORM_FACTOR) return false;
  const expectedDeviceId = policy.scope === 'user_space' ? '*' : currentDeviceId?.trim();
  return Boolean(expectedDeviceId) && identity.deviceId === expectedDeviceId;
}
