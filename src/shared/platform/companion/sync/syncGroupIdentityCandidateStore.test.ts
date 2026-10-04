// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort.js';

const runtime = vi.hoisted(() => ({ port: null as unknown }));
vi.mock('../../companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: (task: () => Promise<unknown>) => task()
}));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: (task: (port: unknown) => Promise<unknown>) => task(runtime.port),
    runWriter: (task: (port: unknown) => Promise<unknown>) => task(runtime.port)
  })
}));

import { countCompanionIdentityCandidates, initializeCompanionIdentityCandidates,
  initializeCompanionIdentityChangedKeys, readCompanionIdentityCandidatePage,
  readCompanionIdentityChangedPartitions, stageCompanionIdentityCandidates,
  stageCompanionIdentityChangedCandidates, stageCompanionIdentityChangedKeys
} from './syncGroupIdentityCandidateStore.js';

it('stages fixed-view candidates and pages each direction in global ID order', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-candidate-store-'));
  const cache = path.join(root, 'cache');
  await fs.mkdir(cache);
  const snapshotPath = path.join(cache, 'foliole-provider-source-test.db').split(path.sep).join('/');
  const snapshot = new Database(snapshotPath);
  snapshot.close();
  const sqlite = new Database(':memory:');
  runtime.port = createBetterSqliteDbPort(sqlite);
  try {
    await initializeCompanionIdentityCandidates(snapshotPath);
    await stageCompanionIdentityCandidates(snapshotPath, [
      { object_type: 'node', object_id: 'z', partition: 1, kind: 'divergent',
        source_fingerprint: 'a'.repeat(64), receiver_fingerprint: 'b'.repeat(64) },
      { object_type: 'node', object_id: 'a', partition: 2, kind: 'source_only',
        source_fingerprint: 'c'.repeat(64), receiver_fingerprint: null },
      { object_type: 'node', object_id: 'm', partition: 3, kind: 'receiver_only',
        source_fingerprint: null, receiver_fingerprint: 'd'.repeat(64) }
    ]);
    await stageCompanionIdentityCandidates(snapshotPath, [{ object_type: 'node', object_id: 'z',
      partition: 1, kind: 'divergent', source_fingerprint: 'e'.repeat(64),
      receiver_fingerprint: 'f'.repeat(64) }]);
    expect(await countCompanionIdentityCandidates(snapshotPath)).toBe(3);
    const base = { snapshotPath, groupId: 'group', sourcePeerId: 'source',
      targetPeerId: 'receiver', sourceViewId: '12345678-1234-1234-1234-123456789abc' };
    const first = await readCompanionIdentityCandidatePage({ ...base, direction: 'source',
      pageIndex: 0, previousPageId: null, after: null, limit: 1 });
    expect(first.page.objects.map((row) => row.object_id)).toEqual(['a']);
    expect(first.nextAfter).toEqual({ object_type: 'node', object_id: 'a' });
    const second = await readCompanionIdentityCandidatePage({ ...base, direction: 'source',
      pageIndex: 1, previousPageId: first.page.page_id, after: first.nextAfter, limit: 1 });
    expect(second.page.objects).toEqual([{ object_type: 'node', object_id: 'z',
      fingerprint: 'a'.repeat(64) }]);
    const outbound = await readCompanionIdentityCandidatePage({ ...base, direction: 'receiver',
      sourcePeerId: 'receiver', targetPeerId: 'source', pageIndex: 0,
      previousPageId: null, after: null });
    expect(outbound.page.objects.map((row) => row.object_id)).toEqual(['m', 'z']);
    await initializeCompanionIdentityChangedKeys(snapshotPath);
    await stageCompanionIdentityChangedKeys(snapshotPath, [
      { object_type: 'node', object_id: 'only', partition: 4 }
    ]);
    await stageCompanionIdentityChangedCandidates(snapshotPath, [
      { object_type: 'node', object_id: 'only', partition: 4, kind: 'source_only',
        source_fingerprint: 'a'.repeat(64), receiver_fingerprint: null },
      { object_type: 'node', object_id: 'ignored', partition: 5, kind: 'source_only',
        source_fingerprint: 'b'.repeat(64), receiver_fingerprint: null }
    ]);
    expect(await readCompanionIdentityChangedPartitions(snapshotPath)).toEqual([{ partition: 4 }]);
    expect(await countCompanionIdentityCandidates(snapshotPath)).toBe(4);
  } finally {
    sqlite.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
