import { CANONICAL_EXTENSION_BY_MIME } from '../../platform/attachmentResource.js';

const key = "json_extract(resource.value, '$.storage_key')";
const mime = Object.entries(CANONICAL_EXTENSION_BY_MIME)
  .map(([type, extension]) => `WHEN '${extension}' THEN '${type}'`).join(' ');

/** A read projection of node-owned facts, never a stored registry or file inventory. */
export const NODE_RESOURCES_SQL = `SELECT owner.id AS node_id,
  substr(${key}, 1, 64) AS attachment_id, substr(${key}, 1, 64) AS content_hash,
  ${key} AS storage_key, json_extract(resource.value, '$.role') AS role,
  json_extract(resource.value, '$.original_name') AS original_name,
  CASE substr(${key}, 65) ${mime} END AS mime_type,
  'unresolved' AS availability, 0 AS size_bytes
  FROM nodes owner, json_each(owner.resource_references) resource`;
