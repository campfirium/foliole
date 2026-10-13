import type { DbPort } from './dbPort.js';
import type { SyncObjectRecord } from './syncObjectRecord.js';

/** Owner generations take precedence over clocks from different devices. */
export async function compareReadwiseOwnerEpoch(port: DbPort, record: SyncObjectRecord) {
  if (record.object_type !== 'setting' || record.object_id !== 'user_space:windows:desktop:*:readwise_active_host') return null;
  if (record.deleted_at || !record.payload_json) return 'stale';
  const [row] = await port.query<{ incoming_epoch: number | null; local_epoch: number | null; content_hash: string }>(
    `WITH incoming AS (SELECT CASE WHEN json_valid(?) THEN json_extract(?, '$.value_json') END AS value)
     SELECT CASE WHEN json_valid(incoming.value) THEN
       CASE WHEN json_type(incoming.value, '$.epoch') = 'integer' THEN json_extract(incoming.value, '$.epoch') END
       END AS incoming_epoch,
       CASE WHEN json_valid(local.value_json) THEN
       CASE WHEN json_type(local.value_json, '$.epoch') = 'integer' THEN json_extract(local.value_json, '$.epoch') END
       END AS local_epoch, local.content_hash
     FROM incoming JOIN setting_records local ON local.key = 'readwise_active_host'
       AND local.scope = 'user_space' AND local.platform = 'windows'
       AND local.form_factor = 'desktop' AND local.host_name = '*'`, [record.payload_json, record.payload_json]);
  if (row?.incoming_epoch == null || row.local_epoch == null) return 'stale';
  return row.incoming_epoch > row.local_epoch ||
    (row.incoming_epoch === row.local_epoch && row.content_hash === record.content_hash) ? 'apply' : 'stale';
}
