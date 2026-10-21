// @vitest-environment node
import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { readFixtureInventory } from '../../../../../../electron/sync/desktopFramedSyncPublicationRecovery.testSupport.js';
import { createCompanionRequestFixture, native } from '../../../../../test/companionRequestSync.testSupport.js';

let host: Awaited<ReturnType<typeof createCompanionRequestFixture>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; });

it.each([
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'a'.repeat(64)
])('converges retired hash disagreement through real HTTP without rewriting history (%s)', { meta: { calibratedMs: 30000 } }, async leftHash => {
  host = await createCompanionRequestFixture();
  const { fixture } = host;
  const nodeId = 't326-retired-hash';
  await fixture.left.seed({ content: 'Original', nodeId, title: 'Topic' });
  await host.sync();
  const versionId = host.sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?').pluck().get(nodeId);
  await fixture.left.seed({ content: 'Current complete body', nodeId, title: 'Topic' });
  await host.sync();
  const right = new Database(fixture.rightSnapshot.databasePath);
  try {
    const update = `UPDATE node_sync_versions SET snapshot_json = json_set(snapshot_json, '$.body_blob_hash', ?)
      WHERE version_id = ? AND body_text IS NULL AND json_extract(snapshot_json, '$.body_deleted') = 1`;
    expect(host.sqlite.prepare(update).run(leftHash, versionId).changes).toBe(1);
    expect(right.prepare(update).run('b'.repeat(64), versionId).changes).toBe(1);
    const stored = `SELECT version_id, content_hash, parent_version_id, body_text, snapshot_json
      FROM node_sync_versions WHERE version_id = ?`;
    const leftBefore = host.sqlite.prepare(stored).get(versionId);
    const rightBefore = right.prepare(stored).get(versionId);
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    expect(await readFixtureInventory(fixture.left)).toEqual(await readFixtureInventory(fixture.right));
    await fixture.right.seed({ content: 'New remote edit', nodeId, title: 'Topic' });
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    await fixture.left.seed({ content: 'New local edit', nodeId, title: 'Topic' });
    await fixture.right.synchronize(fixture.leftSnapshot.origin);
    await host.restart();
    expect(await host.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
    expect(host.sqlite.prepare(stored).get(versionId)).toEqual(leftBefore);
    expect(right.prepare(stored).get(versionId)).toEqual(rightBefore);
    for (const db of [host.sqlite, right]) {
      expect(db.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId)).toBe('New local edit');
    }
  } finally { right.close(); }
});

it('discards a fixed request after its source summary changes and rebuilds it finitely', { meta: { calibratedMs: 30000 } }, async () => {
  host = await createCompanionRequestFixture();
  const current = host;
  const nodeId = 't326-stale-summary';
  await current.fixture.right.seed({ nodeId, title: 'Topic', content: 'Snapshot before request' });
  let pulls = 0;
  native.post.mockImplementation(async input => {
    if (new URL(input.url).searchParams.get('request') === 'pulls') {
      if (++pulls > 4) throw new Error('stale_request_not_rebuilt');
      if (pulls === 1) await current.fixture.right.seed({ nodeId, title: 'Topic', content: 'Fresh snapshot' });
    }
    return current.post(input);
  });
  expect(await current.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
  expect(pulls).toBeGreaterThan(1);
  expect(current.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId)).toBe('Fresh snapshot');
});

it('rejects a previous-generation HTTP request before data apply and accepts a fresh retry', { meta: { calibratedMs: 30000 } }, async () => {
  host = await createCompanionRequestFixture();
  const current = host;
  await current.fixture.left.seed({ nodeId: 't326-protocol-boundary', title: 'Topic', content: 'Protected' });
  const before = await readFixtureInventory(current.fixture.right);
  native.post.mockImplementationOnce(async input => {
    const key = `${input.directory}/http-out-0`;
    const bytes = await native.files!.read(key);
    if (!bytes) throw new Error('fixture_request_missing');
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(10, 24);
    await native.files!.write(key, bytes);
    expect(input.request_chunk_count).toBe(1);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const url = new URL(input.url);
    const signed = await native.sign({ sync_group_id: input.sync_group_id,
      method: 'POST', path_with_query: `${url.pathname}${url.search}`, body_hash: hash });
    return current.post({ ...input, headers: { ...input.headers, ...signed.headers, 'x-foliole-body-sha256': hash } });
  });
  await expect(current.sync()).rejects.toThrow('framed_sync_protocol_version_unsupported');
  expect(await readFixtureInventory(current.fixture.right)).toEqual(before);
  expect(await current.sync()).toMatchObject({ remainingStructureChangeCount: 0 });
});
