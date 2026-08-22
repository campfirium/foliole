export const SYSTEM_ENTRY_IDS = [
  'home', 'inbox', 'trash', 'virtual-root', 'published', 'shelved', 'removed'
] as const;

export type SystemEntryId = (typeof SYSTEM_ENTRY_IDS)[number];

export const SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_KEY = 'system_entry_display_names';
export const SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_IDENTITY = Object.freeze({
  formFactor: 'desktop',
  hostName: '*',
  objectId: 'user_space:windows:desktop:*:system_entry_display_names',
  platform: 'windows',
  scope: 'user_space'
} as const);
export const SYSTEM_ENTRY_DISPLAY_NAMES_PAYLOAD_VERSION = 1;
export const SYSTEM_ENTRY_DISPLAY_NAMES_SYNC_CAPABILITY = 'system-entry-display-names-v1';

export type SystemEntryDisplayNamesPayload = {
  customDisplayNameById: Partial<Record<SystemEntryId, string>>;
  version: typeof SYSTEM_ENTRY_DISPLAY_NAMES_PAYLOAD_VERSION;
};

const SYSTEM_ENTRY_ID_SET = new Set<string>(SYSTEM_ENTRY_IDS);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseNames(value: unknown) {
  const source = record(value);
  if (!source) throw new Error('invalid_system_entry_display_names_map');
  const names: Partial<Record<SystemEntryId, string>> = {};
  for (const [id, name] of Object.entries(source)) {
    if (!SYSTEM_ENTRY_ID_SET.has(id)) throw new Error(`unknown_system_entry_id:${id}`);
    if (typeof name !== 'string' || !name || name !== name.trim()) {
      throw new Error(`invalid_system_entry_display_name:${id}`);
    }
    names[id as SystemEntryId] = name;
  }
  return names;
}

export function parseSystemEntryDisplayNamesPayload(value: unknown): SystemEntryDisplayNamesPayload {
  const source = record(value);
  if (!source || Object.keys(source).some((key) => key !== 'version' && key !== 'customDisplayNameById')) {
    throw new Error('invalid_system_entry_display_names_payload');
  }
  if (source.version !== SYSTEM_ENTRY_DISPLAY_NAMES_PAYLOAD_VERSION) {
    throw new Error('unsupported_system_entry_display_names_version');
  }
  return {
    customDisplayNameById: parseNames(source.customDisplayNameById),
    version: SYSTEM_ENTRY_DISPLAY_NAMES_PAYLOAD_VERSION
  };
}

export function parseSystemEntryDisplayNamesValueJson(valueJson: string) {
  try {
    return parseSystemEntryDisplayNamesPayload(JSON.parse(valueJson));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('invalid_system_entry_display_names_json');
    throw error;
  }
}

export function isSystemEntryDisplayNamesSettingObjectId(objectId: string) {
  return objectId.split(':').at(-1) === SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_KEY;
}

export function assertSystemEntryDisplayNamesSettingIdentity(objectId: string) {
  if (!isSystemEntryDisplayNamesSettingObjectId(objectId)) return false;
  if (objectId !== SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_IDENTITY.objectId) {
    throw new Error('invalid_system_entry_display_names_identity');
  }
  return true;
}

export function assertSystemEntryDisplayNamesSettingPayload(
  objectId: string,
  value: unknown
) {
  if (!assertSystemEntryDisplayNamesSettingIdentity(objectId)) return false;
  const payload = record(value);
  const identity = SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_IDENTITY;
  if (!payload || payload.scope !== identity.scope || payload.platform !== identity.platform ||
      payload.form_factor !== identity.formFactor || payload.host_name !== identity.hostName ||
      payload.key !== SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_KEY || typeof payload.value_json !== 'string') {
    throw new Error('invalid_system_entry_display_names_identity');
  }
  parseSystemEntryDisplayNamesValueJson(payload.value_json);
  return true;
}
