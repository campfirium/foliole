import Database from 'better-sqlite3';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { installHistoricalDesktopSchema } from './historicalMigration.test-support.js';

const NOW = '2026-10-01T00:00:00.000Z';

function chapter(topic: number, version: number, kb: number) {
  const line = `Topic ${topic} revision ${version}: rivers shaped trade routes and cities. `;
  return line.repeat(Math.ceil((kb * 1024) / line.length));
}

/** A schema-153 library shaped like an illustrated textbook: long bodies, several stored revisions each. */
export function historicalTextbookLibrary(topics: number, versions: number, kb: number) {
  const sqlite = new Database(':memory:');
  installHistoricalDesktopSchema(sqlite, 153);
  const driver = createBetterSqlite3Driver(sqlite);
  const version = sqlite.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES (?, ?, ?, 'seed', ?, ?, ?, ?)`);
  const edge = sqlite.prepare('INSERT INTO node_sync_version_parents (version_id, parent_version_id, ordinal) VALUES (?, ?, 0)');
  sqlite.transaction(() => {
    for (let t = 0; t < topics; t++) {
      const id = `topic-${t}`;
      let parent: string | null = null;
      let body = '';
      for (let v = 0; v < versions; v++) {
        body = chapter(t, v, kb);
        const versionId = `${id}-v${v}`;
        const hash = upsertTextBodyBlob(driver, body, NOW);
        version.run(versionId, id, parent, NOW, hashTextBody(`${versionId}\n${body}`), body, JSON.stringify({
          id, kind: 'topic', title: id, content: body, body_blob_hash: hash, text_alternatives: [] }));
        if (parent) edge.run(versionId, parent);
        parent = versionId;
      }
      sqlite.prepare(`INSERT INTO nodes (id, title, content, body_blob_hash, current_version_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, id, body, hashTextBody(body), parent, NOW, NOW);
      sqlite.prepare(`INSERT INTO sync_object_state (object_type, object_id, state_seq, current_version_id, content_hash,
        last_modified_by_host_name, updated_at) VALUES ('node', ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state),
        ?, ?, 'seed', ?) ON CONFLICT (object_type, object_id) DO UPDATE SET current_version_id = excluded.current_version_id`)
        .run(id, parent, hashTextBody(`${parent}\n${body}`), NOW);
    }
  })();
  return sqlite;
}
