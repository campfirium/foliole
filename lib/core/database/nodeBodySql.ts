export function buildNodeBodyContentSql(nodeAlias = 'n', dataAlias = 'cbd') {
  return `CASE
    WHEN NULLIF(TRIM(${nodeAlias}.body_blob_hash), '') IS NULL THEN ${nodeAlias}.content
    WHEN ${dataAlias}.hash IS NOT NULL THEN CAST(${dataAlias}.data AS TEXT)
    ELSE ''
  END`;
}
