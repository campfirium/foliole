// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createAttachmentDemandCache } from '../../lib/core/sync/attachmentDemandCache.js';
import { attachmentWorkBudget, requestAttachmentWorkYield } from '../../lib/core/sync/attachmentWorkBudget.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

it('resumes a 30000-node scan after yielding and reuses bodies until committed revision changes', async () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, deleted_at TEXT, body_blob_hash TEXT,
    resource_references TEXT, content TEXT);
    CREATE TABLE node_version_local_proof_state (singleton_id INTEGER, library_epoch TEXT, proof_revision INTEGER);
    INSERT INTO node_version_local_proof_state VALUES (1, 'epoch', 0)`);
  const key = `${'a'.repeat(64)}.png`;
  const replacement = `${'b'.repeat(64)}.png`;
  const insert = sqlite.prepare('INSERT INTO nodes VALUES (?, NULL, NULL, ?, ?)');
  sqlite.transaction(() => {
    for (let i = 0; i < 30000; i++) insert.run(String(i).padStart(6, '0'), '[]', `${'body '.repeat(100)}![image](asset://${key})`);
  })();
  const port = createBetterSqliteDbPort(sqlite);
  let bodyRows = 0;
  let pages = 0;
  let interrupt = true;
  const host = { readSnapshot: <T>(read: (db: typeof port) => Promise<T>) => port.transaction(tx => read({ ...tx,
    async query<T extends Record<string, unknown>>(sql: string, params?: Parameters<typeof port.query>[1]) {
      const rows = await tx.query<T>(sql, params);
      if (sql.includes('resource_references, content')) {
        bodyRows += rows.length;
        pages++;
        if (interrupt) { requestAttachmentWorkYield(); interrupt = false; }
      }
      return rows;
    }
  })) };
  const demand = createAttachmentDemandCache();
  const started = performance.now();
  try {
    const budget = attachmentWorkBudget();
    expect(await demand(host, budget)).toEqual({ keys: [key], pending: true });
    expect(bodyRows).toBe(128);
    const pausedPages = pages;
    expect(await demand(host, () => false)).toEqual({ keys: [key], pending: false });
    expect(bodyRows).toBe(30000);
    const totalPages = pages;
    for (let round = 0; round < 20; round++) expect(await demand(host, () => false)).toEqual({ keys: [key], pending: false });
    expect(pages).toBe(totalPages);
    sqlite.transaction(() => {
      sqlite.prepare('UPDATE nodes SET content = ? WHERE id = ?').run(`![new](asset://${replacement})`, '000000');
      sqlite.exec('UPDATE node_version_local_proof_state SET proof_revision = proof_revision + 1');
    })();
    expect(new Set((await demand(host, () => false)).keys)).toEqual(new Set([key, replacement]));
    expect(bodyRows).toBe(60000);
    console.info(JSON.stringify({ sampleNodes: 30000, pausedPages, cachedRounds: 20, bodyRows,
      elapsedMs: Math.round(performance.now() - started) }));
  } finally { sqlite.close(); }
});

it('visits later references during continuous writes and preserves readable demand beside a missing body', async () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY, deleted_at TEXT, body_blob_hash TEXT,
    resource_references TEXT, content TEXT);
    CREATE TABLE node_version_local_proof_state (singleton_id INTEGER, library_epoch TEXT, proof_revision INTEGER);
    INSERT INTO node_version_local_proof_state VALUES (1, 'epoch', 0)`);
  const key = `${'c'.repeat(64)}.png`;
  const insert = sqlite.prepare('INSERT INTO nodes VALUES (?, NULL, NULL, ?, ?)');
  for (let i = 0; i < 300; i++) insert.run(String(i).padStart(3, '0'), '[]', i === 299 ? `![last](asset://${key})` : 'Body');
  sqlite.exec("UPDATE nodes SET body_blob_hash = 'missing', content = NULL WHERE id = '000'");
  const port = createBetterSqliteDbPort(sqlite);
  const host = { readSnapshot: <T>(read: (db: typeof port) => Promise<T>) => port.transaction(read) };
  const demand = createAttachmentDemandCache();
  const seen = new Set<string>();
  try {
    for (let round = 0; round < 3; round++) {
      sqlite.exec('UPDATE node_version_local_proof_state SET proof_revision = proof_revision + 1');
      const result = await demand(host, () => true);
      result.keys.forEach(value => seen.add(value));
    }
    expect([...seen]).toEqual([key]);
    // A new library identity must restart the cursor and discard old references.
    sqlite.exec("DELETE FROM nodes; UPDATE node_version_local_proof_state SET library_epoch = 'replacement'");
    expect(await demand(host, () => true)).toEqual({ keys: [], pending: false });
  } finally { sqlite.close(); }
});
