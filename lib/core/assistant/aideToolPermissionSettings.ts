// Read switches name where Aide may find and read material, not which tool it uses.
export const AIDE_READ_SCOPE_KEYS = [
  'current',
  'baseTopic',
  'folder',
  'home',
  'virtual',
  'dives',
  'external',
  'trash'
] as const;

export type AideReadScopeKey = typeof AIDE_READ_SCOPE_KEYS[number];

export const AIDE_WRITE_TOOL_KEYS = [
  'createExcerpt',
  'createMaterial',
  'editContent',
  'moveAndOrder',
  'trash',
  'manageIndexes',
  'manageDives'
] as const;

export type AideWriteToolKey = typeof AIDE_WRITE_TOOL_KEYS[number];

// Each modify switch governs one group of Aide tools; restoring from trash belongs with moving there.
export const AIDE_WRITE_TOOL_NAMES: Record<AideWriteToolKey, readonly string[]> = {
  createExcerpt: ['create_text_excerpt'],
  createMaterial: ['create_material'],
  editContent: ['update_material'],
  manageDives: ['create_dive', 'rename_dive', 'add_dive_sources', 'remove_dive_sources'],
  manageIndexes: [
    'create_virtual_folder', 'add_virtual_folder_items', 'remove_virtual_folder_items',
    'reorder_virtual_folder_items', 'update_virtual_folder', 'delete_virtual_folder', 'restore_virtual_folder'
  ],
  moveAndOrder: ['move_material', 'reorder_materials'],
  trash: ['delete_material', 'restore_material']
};

export interface AideToolPermissionSettings {
  /** Every change waits for the person to allow it in the conversation. */
  askBeforeWrite: boolean;
  read: Record<AideReadScopeKey, boolean>;
  readBudget: number;
  write: Record<AideWriteToolKey, boolean>;
}

export const AIDE_READ_BUDGET_DEFAULT = 20_000;
export const AIDE_READ_BUDGET_MIN = 1_000;
export const AIDE_READ_BUDGET_MAX = 200_000;

function allOn<K extends string>(keys: readonly K[]) {
  return Object.fromEntries(keys.map((key) => [key, true])) as Record<K, boolean>;
}

export function createDefaultAideToolPermissionSettings(): AideToolPermissionSettings {
  return {
    askBeforeWrite: true,
    read: allOn(AIDE_READ_SCOPE_KEYS),
    readBudget: AIDE_READ_BUDGET_DEFAULT,
    write: allOn(AIDE_WRITE_TOOL_KEYS)
  };
}

function readSwitches<K extends string>(value: unknown, keys: readonly K[]) {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(keys.map((key) => [
    key,
    typeof record[key] === 'boolean' ? record[key] : true
  ])) as Record<K, boolean>;
}

export function normalizeAideToolPermissionSettings(value: unknown): AideToolPermissionSettings {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    askBeforeWrite: typeof record.askBeforeWrite === 'boolean' ? record.askBeforeWrite : true,
    read: readSwitches(record.read, AIDE_READ_SCOPE_KEYS),
    readBudget: normalizeAideReadBudget(record.readBudget),
    write: readSwitches(record.write, AIDE_WRITE_TOOL_KEYS)
  };
}

export function normalizeAideReadBudget(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return AIDE_READ_BUDGET_DEFAULT;
  return Math.min(AIDE_READ_BUDGET_MAX, Math.max(AIDE_READ_BUDGET_MIN, Math.round(value)));
}

export function isDefaultAideToolPermissions(settings: AideToolPermissionSettings) {
  const defaults = createDefaultAideToolPermissionSettings();
  return settings.readBudget === defaults.readBudget
    && settings.askBeforeWrite === defaults.askBeforeWrite
    && AIDE_READ_SCOPE_KEYS.every((key) => settings.read[key] === defaults.read[key])
    && AIDE_WRITE_TOOL_KEYS.every((key) => settings.write[key] === defaults.write[key]);
}

export function listAideDisabledToolNames(settings: AideToolPermissionSettings): string[] {
  return [
    ...AIDE_WRITE_TOOL_KEYS.filter((key) => !settings.write[key]).flatMap((key) => AIDE_WRITE_TOOL_NAMES[key])
  ];
}
