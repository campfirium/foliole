import { REMINDER_SETTING_OWNER, REMINDER_SETTING_PREFIX } from '../reminders/reminderRule.js';

export const COMPANION_REMINDER_BACKGROUND_ACTION = {
  category: 'foliole-reminder-background-snooze',
  owner: 'foliole-reminder-v1',
  minutes: { 'background-snooze-15': 15, 'background-snooze-30': 30, 'background-snooze-60': 60 },
  authorizeSql: `
    WITH member AS (
      SELECT local_device_identity_key AS id
      FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'
    )
    SELECT 1
    FROM setting_records
    WHERE key = '${REMINDER_SETTING_PREFIX}' || ? AND scope = '${REMINDER_SETTING_OWNER.scope}'
      AND platform = '${REMINDER_SETTING_OWNER.platform}' AND form_factor = '${REMINDER_SETTING_OWNER.form_factor}'
      AND host_name = '*' AND deleted_at IS NULL
      AND json_extract(value_json, '$.revision') = ?
      AND json_extract(value_json, '$.enabled') = 1
      AND json_extract(value_json, '$.trigger.kind') = 'once'
      AND json_extract(value_json, '$.device.kind') = CASE
        WHEN EXISTS (SELECT 1 FROM member) THEN 'sync-member' ELSE 'standalone' END
      AND json_extract(value_json, '$.device.id') = COALESCE(
        (SELECT id FROM member), (SELECT value FROM companion_meta WHERE key = 'device_id'))
  `
} as const;
