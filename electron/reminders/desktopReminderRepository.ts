import { randomUUID } from 'node:crypto';

import { loadStandaloneDeviceUuid } from '../../lib/core/database/standaloneDeviceIdentity.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import {
  isReminderForDevice, REMINDER_SETTING_OWNER, REMINDER_SETTING_PREFIX,
  reminderRuleSchema, reminderSettingKey, type ReminderRule
} from '../../lib/core/reminders/reminderRule.js';
import { buildCanonicalSettingSyncPayload } from '../../lib/core/sync/canonicalPrivateStatePayload.js';
import type { DesktopReminderDraft } from '../../lib/platform/nativeReminderContract.js';
import { openDatabaseConnection } from '../database/connection.js';

const { scope, platform, form_factor: formFactor } = REMINDER_SETTING_OWNER;
const owner = [scope, platform, formFactor];
const ownerWhere = "scope = ? AND platform = ? AND form_factor = ? AND host_name = '*' AND deleted_at IS NULL";

export function loadDesktopReminderDevice() {
  const id = loadStandaloneDeviceUuid(openDatabaseConnection().driver);
  if (!id) throw new Error('Desktop reminder device is unavailable.');
  return { kind: 'standalone', id } as const;
}

function parseRecord(row: { key: string; value_json: string }) {
  const rule = reminderRuleSchema.parse(JSON.parse(row.value_json));
  if (reminderSettingKey(rule.id) !== row.key) throw new Error('Invalid reminder record identity.');
  return rule;
}

export function loadDesktopReminder(id: string) {
  const row = openDatabaseConnection().driver.queryOne<{ key: string; value_json: string }>(
    `SELECT key, value_json FROM setting_records WHERE ${ownerWhere} AND key = ?`,
    [...owner, reminderSettingKey(id)]
  );
  return row ? parseRecord(row) : null;
}

export function loadDesktopReminders() {
  const device = loadDesktopReminderDevice();
  return openDatabaseConnection().driver.queryAll<{ key: string; value_json: string }>(
    `SELECT key, value_json FROM setting_records WHERE ${ownerWhere} AND key GLOB ? ORDER BY key`,
    [...owner, REMINDER_SETTING_PREFIX + '*']
  ).map(parseRecord).filter(rule => isReminderForDevice(rule, device));
}

export function saveDesktopReminder(draft: DesktopReminderDraft): ReminderRule {
  const device = loadDesktopReminderDevice();
  const previous = draft.previous && loadDesktopReminder(draft.previous.id);
  if (draft.previous && (!previous || !isReminderForDevice(previous, device) ||
    previous.revision !== draft.previous.revision || previous.trigger.kind === 'once')) {
    throw new Error('Reminder changed or is unavailable on this device.');
  }
  if (!draft.previous && draft.preset && loadDesktopReminders().some(rule => rule.preset === draft.preset)) {
    throw new Error('Reminder changed or is unavailable on this device.');
  }
  const rule = reminderRuleSchema.parse({
    id: previous?.id ?? randomUUID(), revision: randomUUID(), device,
    trigger: draft.trigger, message: draft.message, enabled: draft.enabled, destination: draft.destination,
    preset: previous ? previous.preset : draft.preset
  });
  const key = reminderSettingKey(rule.id);
  const valueJson = JSON.stringify(rule);
  const payload = buildCanonicalSettingSyncPayload({
    ...REMINDER_SETTING_OWNER, host_name: '*', key, value_json: valueJson
  });
  const hash = computeSyncContentHash('setting', payload);
  // Publication is owned by the workgroup reminder increment.
  openDatabaseConnection().driver.execute(
    `INSERT INTO setting_records (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
     VALUES (?, ?, ?, ?, '*', ?, ?, ?)
     ON CONFLICT(key, scope, platform, form_factor, host_name) DO UPDATE SET
       value_json = excluded.value_json, content_hash = excluded.content_hash, updated_at = excluded.updated_at`,
    [key, ...owner, valueJson, hash, new Date().toISOString()]
  );
  return rule;
}
