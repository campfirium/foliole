export const DIVE_CONVERSION_MATCHES_SQL = `WITH RECURSIVE matched AS (
    SELECT topic.id, topic.parent_id, entry.key AS position
    FROM json_each(?) entry JOIN nodes topic ON topic.id = entry.value
    LEFT JOIN nodes parent ON parent.id = topic.parent_id
    WHERE topic.kind = 'topic' AND topic.anchor_link IS NULL AND topic.virtual_filter IS NULL
      AND (topic.parent_id IS NULL OR (parent.kind = 'folder' AND parent.virtual_filter IS NULL AND parent.id <> ?))
  ), ancestors(source_id, id, parent_id, deleted_at) AS (
    SELECT id, id, parent_id, deleted_at FROM nodes WHERE id IN (SELECT id FROM matched)
    UNION
    SELECT a.source_id, p.id, p.parent_id, p.deleted_at FROM ancestors a JOIN nodes p ON p.id = a.parent_id
  ), visible AS (
    SELECT source_id FROM ancestors GROUP BY source_id HAVING MAX(parent_id IS NULL) = 1 AND MAX(deleted_at IS NOT NULL) = 0
  )
  SELECT matched.id FROM matched JOIN visible ON source_id = matched.id ORDER BY position`;
