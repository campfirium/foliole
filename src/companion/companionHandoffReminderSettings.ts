export type HandoffReminderDelay = 'off' | '2' | '5' | '15' | '30' | '60' | '180';

export interface CompanionHandoffReminderSettings {
  fixedTime: string | null;
  shortDelay: HandoffReminderDelay;
}

const STORAGE_KEY = 'foliole-companion-handoff-reminder-settings';
const DEFAULT_SETTINGS: CompanionHandoffReminderSettings = {
  fixedTime: null,
  shortDelay: 'off'
};

function isDelay(value: unknown): value is HandoffReminderDelay {
  return value === 'off' || value === '2' || value === '5' || value === '15' || value === '30' || value === '60' || value === '180';
}

function isTime(value: unknown) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : null;
}

export function normalizeHandoffReminderSettings(value: unknown): CompanionHandoffReminderSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_SETTINGS;
  }
  const record = value as Record<string, unknown>;
  return {
    fixedTime: isTime(record.fixedTime),
    shortDelay: isDelay(record.shortDelay) ? record.shortDelay : DEFAULT_SETTINGS.shortDelay
  };
}

export function loadHandoffReminderSettings(storage: Storage = window.localStorage): CompanionHandoffReminderSettings {
  try {
    return normalizeHandoffReminderSettings(JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveHandoffReminderSettings(
  settings: CompanionHandoffReminderSettings,
  storage: Storage = window.localStorage
) {
  storage.setItem(STORAGE_KEY, JSON.stringify(normalizeHandoffReminderSettings(settings)));
}
