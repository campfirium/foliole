import Database from 'better-sqlite3';

/** Observe real SQLite JSON evaluation while leaving production queries and writes intact. */
export function observeAlternativeLookup(sqlite: Database.Database, unrelatedCount: number) {
  const evaluatedIds: string[] = [];
  const evaluator = new Database(':memory:');
  const extract = evaluator.prepare('SELECT json_extract(?, ?) AS value');
  sqlite.function('json_extract', (json: string, selector: string) => {
    if (selector === '$.id') evaluatedIds.push(JSON.parse(json).id);
    return (extract.get(json, selector) as { value: string | number | null }).value;
  });
  sqlite.transaction(() => {
    for (let i = 0; i < unrelatedCount; i++) {
      sqlite.prepare(`INSERT INTO nodes (id, kind, title, content, current_version_id, created_at, updated_at)
        VALUES (?, 'topic', 'Unrelated', '', ?, '2026-01-01', '2026-01-01')`).run(`unrelated-${i}`, `unrelated-v-${i}`);
      sqlite.prepare(`INSERT INTO node_sync_versions (version_id, object_id, host_name, created_at, content_hash, snapshot_json)
        VALUES (?, ?, 'host', '2026-01-01', 'hash', ?)`).run(`unrelated-v-${i}`, `unrelated-${i}`,
        JSON.stringify({ text_alternatives: [{ id: `unrelated-alt-${i}` }] }));
    }
  })();
  return { evaluatedIds, close: () => evaluator.close() };
}
