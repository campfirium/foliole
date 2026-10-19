// @vitest-environment node
import { expect, it } from 'vitest';

import type { DbParams, DbRow } from '../../../../../lib/core/sync/dbPort';
import { createDisplayLibrary } from '../sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport';

import { readCompanionAttachmentReferences } from './companionAttachmentReferenceSnapshot';

it('allows a committed write during the readonly scan and rejects its stale conclusion', async () => {
  const library = createDisplayLibrary('android');
  try {
    await library.owner.open({ expectedHostName: 'scan-fixture', now: '2026-10-19T00:00:00.000Z' });
    await library.owner.runWriter(db => db.run("INSERT INTO nodes (id, title, content, created_at, updated_at) VALUES ('a', 'A', '', 'now', 'now')"));
    const original = library.owner.readBackgroundSnapshot.bind(library.owner);
    let wroteDuringScan = false;
    library.owner.readBackgroundSnapshot = (task, signal) => original(async db => {
      await db.query('SELECT id FROM nodes');
      await library.owner.runWriter(writer => writer.run("UPDATE nodes SET title = 'Edited' WHERE id = 'a'"));
      wroteDuringScan = true;
      return task(db);
    }, signal);
    await expect(readCompanionAttachmentReferences(library.owner)).rejects.toThrow('attachment_scan_foreground_write');
    expect(wroteDuringScan).toBe(true);
    expect(await library.owner.read(db => db.query("SELECT title FROM nodes WHERE id = 'a'")))
      .toEqual([{ title: 'Edited' }]);
  } finally { await library.close(); }
}, 10000);

it('returns references for an unchanged library and rejects cancellation', async () => {
  const library = createDisplayLibrary('android');
  try {
    await library.owner.open({ expectedHostName: 'scan-fixture', now: '2026-10-19T00:00:00.000Z' });
    expect((await readCompanionAttachmentReferences(library.owner)).storageKeys).toEqual([]);
    await expect(readCompanionAttachmentReferences(library.owner, AbortSignal.abort(new Error('user-active'))))
      .rejects.toThrow('user-active');
  } finally { await library.close(); }
});

it.each(['android', 'ios'] as const)('%s yields an attachment scan to foreground snapshot reads', async platform => {
  const library = createDisplayLibrary(platform);
  try {
    await library.owner.open({ expectedHostName: 'scan-fixture', now: '2026-10-19T00:00:00.000Z' });
    await library.owner.runWriter(db => db.run(`WITH RECURSIVE ids(id) AS (
      VALUES (1) UNION ALL SELECT id + 1 FROM ids WHERE id < 200
    ) INSERT INTO nodes (id, title, content, created_at, updated_at)
      SELECT 'scan-' || id, 'Topic', 'Body', 'now', 'now' FROM ids`));
    const original = library.owner.readBackgroundSnapshot.bind(library.owner);
    let foreground: Promise<unknown> | undefined;
    let batches = 0;
    let batchesWhenForegroundFinished = 0;
    library.owner.readBackgroundSnapshot = (task, signal) => original(db => task({
      ...db,
      async query<T extends DbRow>(sql: string, params?: DbParams) {
        const result = await db.query<T>(sql, params);
        if (sql.includes('resource_references, content FROM nodes WHERE id IN')) {
          batches += 1;
          foreground ??= library.owner.readSnapshot(reader => reader.query("SELECT COUNT(*) AS count FROM nodes WHERE id LIKE 'scan-%'"))
            .then(rows => { batchesWhenForegroundFinished = batches; return rows; });
        }
        return result;
      }
    }), signal);
    expect((await readCompanionAttachmentReferences(library.owner)).storageKeys).toEqual([]);
    expect(batchesWhenForegroundFinished).toBe(1);
    expect(batches).toBeGreaterThan(1);
    expect(await foreground).toEqual([{ count: 200 }]);
    library.owner.readBackgroundSnapshot = original;
    expect((await readCompanionAttachmentReferences(library.owner)).storageKeys).toEqual([]);
    expect(await library.owner.read(db => db.query("SELECT COUNT(*) AS count FROM nodes WHERE content = 'Body'")))
      .toEqual([{ count: 200 }]);
  } finally { await library.close(); }
});

it.each(['android', 'ios'] as const)('%s eventually completes scanning amid repeated foreground reads', async platform => {
  const library = createDisplayLibrary(platform);
  try {
    await library.owner.open({ expectedHostName: 'scan-fixture', now: '2026-10-19T00:00:00.000Z' });
    await library.owner.runWriter(db => db.run(`WITH RECURSIVE ids(id) AS (
      VALUES (1) UNION ALL SELECT id + 1 FROM ids WHERE id < 200
    ) INSERT INTO nodes (id, title, content, created_at, updated_at)
      SELECT 'scan-' || id, 'Topic', 'Body', 'now', 'now' FROM ids`));
    const image = `${'a'.repeat(64)}.png`;
    await library.owner.runWriter(db => db.run("UPDATE nodes SET content = ? WHERE id = 'scan-99'",
      [`![image](asset://${image})`]));
    const original = library.owner.readBackgroundSnapshot.bind(library.owner);
    let foreground: Promise<unknown> | undefined;
    const firstBatches: string[] = [];
    library.owner.readBackgroundSnapshot = (task, signal) => original(db => task({
      ...db,
      async query<T extends DbRow>(sql: string, params?: DbParams) {
        const result = await db.query<T>(sql, params);
        if (sql.includes('resource_references, content FROM nodes WHERE id IN')) {
          firstBatches.push(JSON.stringify(params));
          foreground = library.owner.readSnapshot(reader => reader.query('SELECT 1 AS ready'));
        }
        return result;
      }
    }), signal);
    let completed = false;
    const failures: string[] = [];
    for (let attempt = 0; attempt < 8 && !completed; attempt += 1) {
      try {
        expect((await readCompanionAttachmentReferences(library.owner)).storageKeys).toEqual([image]);
        completed = true;
      }
      catch (error) { failures.push(String(error)); }
      await foreground;
    }
    library.owner.readBackgroundSnapshot = original;
    expect((await readCompanionAttachmentReferences(library.owner)).storageKeys).toEqual([image]);
    expect({ completed, failures, distinctBatches: new Set(firstBatches).size })
      .toMatchObject({ completed: true });
  } finally { await library.close(); }
});

it.each(['android', 'ios'] as const)('%s rejects a write between released scan batches', async platform => {
  const library = createDisplayLibrary(platform);
  try {
    await library.owner.open({ expectedHostName: 'scan-fixture', now: '2026-10-19T00:00:00.000Z' });
    await library.owner.runWriter(db => db.run("INSERT INTO nodes (id, title, content, created_at, updated_at) VALUES ('a', 'A', '', 'now', 'now')"));
    const original = library.owner.readBackgroundSnapshot.bind(library.owner);
    let wrote = false;
    library.owner.readBackgroundSnapshot = async (task, signal) => {
      const result = await original(task, signal);
      if (!wrote) {
        wrote = true;
        await library.owner.runWriter(db => db.run("UPDATE nodes SET content = 'Changed between batches' WHERE id = 'a'"));
      }
      return result;
    };
    await expect(readCompanionAttachmentReferences(library.owner)).rejects.toThrow('attachment_scan_database_changed');
    expect(wrote).toBe(true);
  } finally { await library.close(); }
});
