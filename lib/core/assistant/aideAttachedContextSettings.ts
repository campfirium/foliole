export const AIDE_ATTACHED_CONTEXT_ITEM_KEYS = [
  'selection',
  'metadata',
  'surrounding',
  'outline',
  'location',
  'annotations'
] as const;

export type AideAttachedContextItemKey = typeof AIDE_ATTACHED_CONTEXT_ITEM_KEYS[number];

export interface AideAttachedContextItemSetting {
  enabled: boolean;
  key: AideAttachedContextItemKey;
  limit: number;
}

export interface AideAttachedContextSettings {
  items: AideAttachedContextItemSetting[];
  totalBudget: number;
}

export const AIDE_ATTACHED_CONTEXT_MAX_BUDGET = 20_000;

const DEFAULT_LIMITS: Record<AideAttachedContextItemKey, number> = {
  annotations: 600,
  location: 100,
  metadata: 100,
  outline: 200,
  selection: 800,
  surrounding: 300
};

export function createDefaultAideAttachedContextSettings(): AideAttachedContextSettings {
  const items = AIDE_ATTACHED_CONTEXT_ITEM_KEYS.map((key) => ({ enabled: true, key, limit: DEFAULT_LIMITS[key] }));
  return { items, totalBudget: items.reduce((sum, item) => sum + item.limit, 0) };
}

export function normalizeAideAttachedContextSettings(value: unknown): AideAttachedContextSettings {
  const defaults = createDefaultAideAttachedContextSettings();
  if (!value || typeof value !== 'object') return defaults;
  const record = value as { items?: unknown; totalBudget?: unknown };
  const seen = new Set<AideAttachedContextItemKey>();
  const items: AideAttachedContextItemSetting[] = [];
  for (const raw of Array.isArray(record.items) ? record.items : []) {
    const item = normalizeItem(raw);
    if (!item || seen.has(item.key)) continue;
    seen.add(item.key);
    items.push(item);
  }
  for (const item of defaults.items) if (!seen.has(item.key)) items.push(item);
  return { items, totalBudget: normalizeBudget(record.totalBudget, defaults.totalBudget) };
}

export function isDefaultAideAttachedContextSettings(settings: AideAttachedContextSettings) {
  return JSON.stringify(settings) === JSON.stringify(createDefaultAideAttachedContextSettings());
}

function normalizeItem(value: unknown): AideAttachedContextItemSetting | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { enabled?: unknown; key?: unknown; limit?: unknown };
  const key = AIDE_ATTACHED_CONTEXT_ITEM_KEYS.find((candidate) => candidate === record.key);
  if (!key) return null;
  return {
    enabled: record.enabled !== false,
    key,
    limit: normalizeBudget(record.limit, DEFAULT_LIMITS[key])
  };
}

function normalizeBudget(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(AIDE_ATTACHED_CONTEXT_MAX_BUDGET, Math.round(value)));
}
