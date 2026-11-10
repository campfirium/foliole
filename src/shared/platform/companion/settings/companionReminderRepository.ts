import {
  REMINDER_SETTING_OWNER, REMINDER_SETTING_PREFIX, reminderRuleSchema, reminderSettingKey,
  type ReminderDevice, type ReminderRule
} from '../../../../../lib/core/reminders/reminderRule';
import { loadCompanionBootstrapState } from '../../companionBootstrap';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { readIosCompanionDatabase, writeIosCompanionDatabase } from '../runtime/iosCompanionActiveDatabase';
import { iosCompanionContentHash } from '../runtime/iosCompanionMutationState';

export async function loadCompanionReminderDevice(): Promise<ReminderDevice> {
  const bootstrap = await loadCompanionBootstrapState();
  const [member] = await readIosCompanionDatabase(db => db.query<{ local_device_identity_key: string }>(
    "SELECT local_device_identity_key FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'"
  ));
  return member
    ? { kind: 'sync-member', id: member.local_device_identity_key }
    : { kind: 'standalone', id: bootstrap.device_id };
}

export function loadCompanionReminderRules() {
  return readIosCompanionDatabase(async db => {
    const rows = await db.query<{ key: string; value_json: string }>(
      `SELECT key, value_json FROM setting_records
        WHERE scope = ? AND platform = ? AND form_factor = ? AND host_name = '*'
          AND deleted_at IS NULL AND key GLOB ? ORDER BY key`,
      [REMINDER_SETTING_OWNER.scope, REMINDER_SETTING_OWNER.platform, REMINDER_SETTING_OWNER.form_factor,
        REMINDER_SETTING_PREFIX + '*']
    );
    return rows.map(row => {
      const rule = reminderRuleSchema.parse(JSON.parse(row.value_json));
      if (reminderSettingKey(rule.id) !== row.key) throw new Error('Invalid reminder record identity.');
      return rule;
    });
  });
}

export async function saveCompanionReminderRule(value: ReminderRule) {
  const rule = reminderRuleSchema.parse(value);
  const payload = { ...REMINDER_SETTING_OWNER, host_name: '*', key: reminderSettingKey(rule.id),
    value_json: JSON.stringify(rule) };
  const hash = await iosCompanionContentHash(payload);
  // Rules use their eventual shared identity; publication starts with the sync integration.
  return runCompanionSyncWriterTask(() => writeIosCompanionDatabase(db => db.run(
    `INSERT INTO setting_records (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key, scope, platform, form_factor, host_name) DO UPDATE SET
        value_json = excluded.value_json, content_hash = excluded.content_hash, updated_at = excluded.updated_at`,
    [payload.key, payload.scope, payload.platform, payload.form_factor, payload.host_name,
      payload.value_json, hash, new Date().toISOString()]
  )));
}
