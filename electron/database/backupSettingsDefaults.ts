import type {
  NativeBackupRetentionTier,
  NativeBackupSettingOverride,
  NativeBackupSettings
} from '../../lib/platform/nativeUtilityContract.js';

const GIGABYTE_BYTES = 1024 * 1024 * 1024;

export const RETENTION_TIERS: NativeBackupRetentionTier[] = [
  'hourly', 'daily', 'weekly', 'monthly'
];

export const SETTING_FIELDS: NativeBackupSettingOverride[] = [
  ...RETENTION_TIERS,
  'backup_dir',
  'extra_backup_dir',
  'extra_backup_max_count',
  'retention_priority',
  'safety_max_count',
  'total_size_limit_bytes'
];

export const DEFAULT_BACKUP_SETTINGS: NativeBackupSettings = {
  schema_version: 3,
  defaults_version: 1,
  daily_max_count: 5,
  hourly_max_count: 8,
  monthly_max_count: 0,
  weekly_max_count: 1,
  backup_dir: '',
  extra_backup_dir: '',
  extra_backup_max_count: 10,
  retention_priority: [...RETENTION_TIERS],
  safety_max_count: 2,
  total_size_limit_bytes: 2 * GIGABYTE_BYTES,
  overridden_fields: [],
  updated_at: '1970-01-01T00:00:00.000Z'
};

export const LEGACY_DEFAULTS = {
  extra_backup_max_count: 10,
  safety_max_count: 5,
  total_size_limit_bytes: 2 * GIGABYTE_BYTES
};

export function normalizeRetentionPriority(value: unknown) {
  if (!Array.isArray(value)) return [...RETENTION_TIERS];
  const result = value.filter((entry): entry is NativeBackupRetentionTier =>
    typeof entry === 'string' && RETENTION_TIERS.includes(entry as NativeBackupRetentionTier));
  return result.length === RETENTION_TIERS.length && new Set(result).size === RETENTION_TIERS.length
    ? result
    : [...RETENTION_TIERS];
}

export function normalizeOverrideFields(value: unknown) {
  if (!Array.isArray(value)) return [];
  return SETTING_FIELDS.filter((field) => value.includes(field));
}

export function sameSettingValue(left: unknown, right: unknown) {
  return Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((entry, index) => entry === right[index])
    : left === right;
}

export function settingValue(
  settings: NativeBackupSettings,
  field: NativeBackupSettingOverride
) {
  if (field === 'hourly') return settings.hourly_max_count;
  if (field === 'daily') return settings.daily_max_count;
  if (field === 'weekly') return settings.weekly_max_count;
  if (field === 'monthly') return settings.monthly_max_count;
  return settings[field];
}

export function withCurrentDefaults(
  value: NativeBackupSettings,
  overrides: NativeBackupSettingOverride[]
) {
  const result = { ...value, retention_priority: [...value.retention_priority] };
  for (const field of SETTING_FIELDS) {
    if (overrides.includes(field)) continue;
    applyDefault(result, field);
  }
  return result;
}

function applyDefault(settings: NativeBackupSettings, field: NativeBackupSettingOverride) {
  if (field === 'hourly') settings.hourly_max_count = DEFAULT_BACKUP_SETTINGS.hourly_max_count;
  else if (field === 'daily') settings.daily_max_count = DEFAULT_BACKUP_SETTINGS.daily_max_count;
  else if (field === 'weekly') settings.weekly_max_count = DEFAULT_BACKUP_SETTINGS.weekly_max_count;
  else if (field === 'monthly') settings.monthly_max_count = DEFAULT_BACKUP_SETTINGS.monthly_max_count;
  else if (field === 'backup_dir') settings.backup_dir = DEFAULT_BACKUP_SETTINGS.backup_dir;
  else if (field === 'extra_backup_dir') settings.extra_backup_dir = DEFAULT_BACKUP_SETTINGS.extra_backup_dir;
  else if (field === 'extra_backup_max_count') settings.extra_backup_max_count = DEFAULT_BACKUP_SETTINGS.extra_backup_max_count;
  else if (field === 'retention_priority') settings.retention_priority = [...DEFAULT_BACKUP_SETTINGS.retention_priority];
  else if (field === 'safety_max_count') settings.safety_max_count = DEFAULT_BACKUP_SETTINGS.safety_max_count;
  else settings.total_size_limit_bytes = DEFAULT_BACKUP_SETTINGS.total_size_limit_bytes;
}
