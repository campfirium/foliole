import { openDatabaseConnection } from './connection.js';
import { parseAnchorLink } from './importPipeline.test-support.js';

export function insertManualChildHighlight(nodeId: string | null) {
  const connection = openDatabaseConnection();
  connection.sqlite.prepare(
    `INSERT INTO nodes (
      id, parent_id, kind, priority, desired_retention, title, is_title_manual,
      content, opening_text, reveal, anchor_link, created_at, updated_at, deleted_at
    ) VALUES (?, ?, 'topic', NULL, NULL, ?, 0, ?, ?, NULL, ?, ?, ?, NULL)`
  ).run(
    'node-manual-highlight',
    nodeId,
    'Manual note',
    'manual text',
    'manual text',
    JSON.stringify({
      id: 'manual-hl-1',
      kind: 'highlight',
      locator: {
        from: 0,
        originalText: 'manual text',
        to: 'manual text'.length
      }
    }),
    '2026-03-22T10:26:30.000Z',
    '2026-03-22T10:26:30.000Z'
  );
  connection.sqlite
    .prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)')
    .run('node-manual-highlight', 999);
}

export function mapInlineAnchorRows(rows: Array<{ anchor_link: string | null; content: string; title: string }>) {
  return rows.map((row) => ({
    anchorLink: parseAnchorLink(row.anchor_link ?? ''),
    content: row.content,
    title: row.title
  }));
}
