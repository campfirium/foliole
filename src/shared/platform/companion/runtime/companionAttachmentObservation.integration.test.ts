// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { hashTextBody } from '../../../../../lib/core/database/textBodyHash';
import { createDisplayLibrary } from '../sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport';

import { readCompanionObservationReferences } from './companionAttachmentObservation';
import { installCompanionAttachmentTestWorker } from './companionAttachmentWorker.testSupport';

let worker: Awaited<ReturnType<typeof installCompanionAttachmentTestWorker>>;
beforeEach(async () => { worker = await installCompanionAttachmentTestWorker(); });
afterEach(() => worker.close());
const image = `${'a'.repeat(64)}.png`;
const pdf = `${'b'.repeat(64)}.pdf`;
const body = `![image](asset://${image})`;
const generation = async () => 'fixture';
async function open(platform: 'android' | 'ios', count = 40) {
  const library = createDisplayLibrary(platform);
  await library.owner.open({ expectedHostName: 'fixture', now: '2026-10-29T00:00:00Z' });
  await library.owner.runWriter(db => db.transaction(async tx => {
    for (let i = 0; i < count; i++) await tx.run(`INSERT INTO nodes(id,title,content,body_blob_hash,created_at,updated_at)
      VALUES (?,'Article',?,?,'now','now')`, [`article-${String(i).padStart(3, '0')}`, body, hashTextBody(body)]);
  }));
  return library;
}

it.each(['android', 'ios'] as const)('%s reuses persisted inputs, updates bodies and PDF mounts, and retains shared references', async platform => {
  const library = await open(platform);
  let reopened: ReturnType<typeof createDisplayLibrary> | undefined;
  try {
    expect((await readCompanionObservationReferences(library.owner, generation))?.storageKeys).toEqual([image]);
    expect(worker.monitor.batches).toBeGreaterThan(1);
    worker.monitor.parsed = 0;
    await readCompanionObservationReferences(library.owner, generation);
    expect(worker.monitor.parsed).toBe(0);
    await library.owner.runWriter(db => db.run("UPDATE nodes SET content='',body_blob_hash=?,resource_references=? WHERE id='article-000'",
      [hashTextBody(''), JSON.stringify([{ storage_key: pdf, role: 'reference', original_name: null }])]));
    expect((await readCompanionObservationReferences(library.owner, generation))?.storageKeys).toEqual([image, pdf]);
    expect(worker.monitor.parsed).toBe(1);
    await library.owner.runWriter(db => db.run("UPDATE nodes SET deleted_at='now' WHERE id='article-000'"));
    expect((await readCompanionObservationReferences(library.owner, generation))?.storageKeys).toEqual([image, pdf]);
    await library.owner.close();
    reopened = createDisplayLibrary(platform, library.file);
    await reopened.owner.open({ expectedHostName: 'fixture', now: '2026-10-29T01:00:00Z' });
    worker.monitor.parsed = 0;
    expect((await readCompanionObservationReferences(reopened.owner, generation))?.storageKeys).toEqual([image, pdf]);
    expect(worker.monitor.parsed).toBe(0);
    await reopened.owner.runWriter(db => db.run("DELETE FROM nodes WHERE id='article-000'"));
    expect((await readCompanionObservationReferences(reopened.owner, generation))?.storageKeys).toEqual([image]);
  } finally { await reopened?.close(); await library.close(); }
});

it.each(['android', 'ios'] as const)('%s discards an overtaken batch and lets foreground writes finish before parsing completes', async platform => {
  const library = await open(platform);
  let wrote = false;
  try {
    worker.monitor.beforeResult = async () => {
      if (wrote) return;
      wrote = true;
      await library.owner.runWriter(db => db.run("UPDATE nodes SET content='',body_blob_hash=NULL WHERE id='article-000'"));
    };
    expect(await readCompanionObservationReferences(library.owner, generation)).toBeNull();
    expect(wrote).toBe(true);
    worker.monitor.beforeResult = undefined;
    worker.monitor.parsed = 0;
    expect((await readCompanionObservationReferences(library.owner, generation))?.storageKeys).toEqual([image]);
    expect(worker.monitor.parsed).toBe(1);
  } finally { await library.close(); }
});

it.each(['android', 'ios'] as const)('%s preserves completed batches on abort and resumes only outstanding work', async platform => {
  const library = await open(platform);
  const controller = new AbortController();
  try {
    worker.monitor.beforeResult = () => { if (worker.monitor.batches === 2) controller.abort(new Error('user_active')); };
    await expect(readCompanionObservationReferences(library.owner, generation, controller.signal)).rejects.toThrow('user_active');
    const { count } = (await library.owner.read(db => db.query<{ count: number }>('SELECT count(*) count FROM attachment_reference_cache')))[0]!;
    expect(count).toBeGreaterThan(0);
    worker.monitor.beforeResult = undefined;
    worker.monitor.parsed = 0;
    expect((await readCompanionObservationReferences(library.owner, generation))?.storageKeys).toEqual([image]);
    const { total } = (await library.owner.read(db => db.query<{ total: number }>('SELECT count(*) total FROM nodes')))[0]!;
    expect(worker.monitor.parsed).toBe(total - count);
  } finally { await library.close(); }
});

it('rejects a replaced generation and unreadable inputs without claiming completion', async () => {
  const library = await open('ios', 1);
  let currentGeneration = 'before';
  try {
    worker.monitor.beforeResult = () => { currentGeneration = 'after'; };
    await expect(readCompanionObservationReferences(library.owner, async () => currentGeneration)).rejects.toThrow('database_replaced');
    expect(await library.owner.read(db => db.query('SELECT * FROM attachment_reference_cache'))).toEqual([]);
    worker.monitor.beforeResult = undefined;
    await library.owner.runWriter(db => db.run("UPDATE nodes SET body_blob_hash=NULL WHERE id='article-000'"));
    await expect(readCompanionObservationReferences(library.owner, generation)).rejects.toThrow('body_unreadable');
  } finally { await library.close(); }
});

it('yields a readonly batch to a foreground writer and permits a later complete attempt', async () => {
  const library = await open('android', 1);
  const original = library.owner.readBackgroundSnapshot.bind(library.owner);
  try {
    library.owner.readBackgroundSnapshot = (task, signal) => original(async db => {
      await db.query('SELECT id FROM nodes');
      await library.owner.runWriter(writer => writer.run("UPDATE nodes SET title='Edited' WHERE id='article-000'"));
      return task(db);
    }, signal);
    await expect(readCompanionObservationReferences(library.owner, generation)).rejects.toThrow('attachment_scan_foreground_write');
    library.owner.readBackgroundSnapshot = original;
    expect((await readCompanionObservationReferences(library.owner, generation))?.storageKeys).toEqual([image]);
  } finally { await library.close(); }
});
