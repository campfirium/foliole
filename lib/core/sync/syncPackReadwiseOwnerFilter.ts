const OWNER_OBJECT_ID = 'user_space:windows:desktop:*:readwise_active_host';

export function readwiseOwnerEpochFilter(alias: string) {
  const incomingValue = `json_extract(owner_payload.payload_json, '$.value_json')`;
  const localValue = 'local_owner.value_json';
  const validEpoch = (value: string) =>
    `CASE WHEN json_valid(${value}) THEN json_type(${value}, '$.epoch') = 'integer' ELSE 0 END`;
  return `incoming.object_type = 'setting' AND incoming.object_id = '${OWNER_OBJECT_ID}' ` +
    `AND EXISTS (SELECT 1 FROM ${alias}.sync_objects owner_payload ` +
    `JOIN main.setting_records local_owner ON local_owner.key = 'readwise_active_host' ` +
    `AND local_owner.scope = 'user_space' AND local_owner.platform = 'windows' ` +
    `AND local_owner.form_factor = 'desktop' AND local_owner.host_name = '*' ` +
    `WHERE owner_payload.object_type = incoming.object_type ` +
    `AND owner_payload.object_id = incoming.object_id AND json_valid(owner_payload.payload_json) ` +
    `AND ${validEpoch(incomingValue)} AND ${validEpoch(localValue)} ` +
    `AND (json_extract(${incomingValue}, '$.epoch') > json_extract(${localValue}, '$.epoch') ` +
    `OR (json_extract(${incomingValue}, '$.epoch') = json_extract(${localValue}, '$.epoch') ` +
    `AND local_owner.content_hash = incoming.content_hash ` +
    `AND current.content_hash <> incoming.content_hash)))`;
}
