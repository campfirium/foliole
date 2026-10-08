// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { buildDesktopSyncPackFromDriver } from './syncPackBuilderFromDriver.js';
import { readPackRowsFromZip } from './syncPackZipReaderTestSupport.js';
import { textBranch, textDevice, wholeBodies } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
let directory = '';
afterEach(async () => {
  devices.splice(0).forEach((host) => host.sqlite.close());
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

it('delivers every alternative body to an empty library through a real built SQLite sync pack', async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-whole-body-pack-'));
  const source = textDevice(); const target = textDevice(); devices.push(source, target);
  const base = textBranch('base', 'Base');
  await source.receive([base, textBranch('a', 'Main longest body', base)]);
  const whole = await source.receive([textBranch('b', 'B', base), textBranch('c', 'C', base)]);
  const pack = path.join(directory, 'whole.syncpack');
  await buildDesktopSyncPackFromDriver({ fromPeerId: 'source', fromStateSeq: 0, outputPath: pack,
    packId: 'whole-pack' }, createBetterSqlite3Driver(source.sqlite));
  readPackRowsFromZip(pack, directory);
  await target.db.run('ATTACH DATABASE ? AS inc', [path.join(directory, 'read-incoming.db')]);
  try {
    await applySyncPackNodeSurfaceWithDbPort(target.db, { currentCursor: 0, hostName: 'target' });
  } finally { await target.db.run('DETACH DATABASE inc'); }
  const restored = await target.current();
  expect(restored.version_id).toBe(whole.version_id);
  expect(wholeBodies(restored)).toEqual(new Set(['Main longest body', 'B', 'C']));
  const storedBodies = target.sqlite.prepare(
    "SELECT json_extract(snapshot_json, '$.text_alternative_bodies') FROM node_sync_versions WHERE version_id = ?"
  ).pluck().get(whole.version_id) as string;
  expect(JSON.parse(storedBodies).map((body: { text: string }) => body.text).sort()).toEqual(['B', 'C']);
  expect(restored.snapshot).not.toHaveProperty('text_alternative_bodies');
  const rejected = textDevice(); devices.push(rejected);
  await rejected.db.run('ATTACH DATABASE ? AS inc', [path.join(directory, 'read-incoming.db')]);
  try {
    await rejected.db.run(`UPDATE inc.node_sync_versions SET snapshot_json =
      json_set(snapshot_json, '$.text_alternative_bodies[0].text', 'corrupted') WHERE version_id = ?`, [whole.version_id]);
    await expect(applySyncPackNodeSurfaceWithDbPort(rejected.db, { currentCursor: 0, hostName: 'target' }))
      .rejects.toThrow('text_alternative_body_hash_mismatch');
    expect(rejected.sqlite.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
    expect(rejected.sqlite.prepare('SELECT COUNT(*) FROM content_blob_data').pluck().get()).toBe(0);
  } finally { await rejected.db.run('DETACH DATABASE inc'); }
});
