/** Read projection of node-owned PDF mounts and local index state; it stores nothing. */
export const NODE_PDF_RESOURCES_SQL = `SELECT owner.id AS node_id,
  substr(json_extract(resource.value, '$.storage_key'), 1, 64) AS id,
  json_extract(resource.value, '$.storage_key') AS storage_key,
  json_extract(resource.value, '$.original_name') AS original_name,
  'reference' AS role, 'application/pdf' AS mime_type,
  state.status AS pdf_index_status, state.indexed_at AS pdf_indexed_at
  FROM nodes owner, json_each(owner.resource_references) resource
  LEFT JOIN pdf_index_state state ON state.attachment_id = substr(json_extract(resource.value, '$.storage_key'), 1, 64)
  WHERE json_extract(resource.value, '$.role') = 'reference'
    AND substr(json_extract(resource.value, '$.storage_key'), 65) = '.pdf'`;
