// @vitest-environment node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.ts';
import { buildWorkspaceSnapshotNode } from '../../lib/core/database/workspaceSnapshotHelpers.ts';
import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion.ts';
import { applySyncPackNodeVersionsWithDbPort } from '../../lib/core/sync/syncPackNodeVersionApplyExecutor.ts';
import { IOS_SYNC_PACK_RESTORE_VERSION_ID } from '../../lib/platform/iosSyncPackAcceptanceContract.ts';

import { createHostedPackTaskSource } from './ios-hosted-sync-pack-task-source.ts';

it('regenerates only the scenario restore expectation and still rejects changed content', async () => {
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-ios-oracle-'));
  let source;
  try {
    source = await createHostedPackTaskSource({ artifactRoot,
      oraclePackPath: 'scripts/ios/fixtures/acceptance-contract-corpus/sync-pack-runtime/successor.syncpack',
      sourceName: 'successor' });
    const database = source.sqlite;
    const version = database.prepare('SELECT * FROM node_sync_versions WHERE version_id = ?')
      .get(IOS_SYNC_PACK_RESTORE_VERSION_ID);
    const node = database.prepare('SELECT * FROM nodes WHERE id = ?').get('ios-acceptance-restore');
    const expected = await toWorkspaceNativeNodeVersion({
      ...buildWorkspaceSnapshotNode(node), currentVersionId: version.parent_version_id,
      deletedAt: null, updatedAt: version.created_at
    }, version.host_name, version.version_id);
    expect(version.content_hash).toBe(expected.content_hash);
    expect(version.snapshot_json).toBe(JSON.stringify(expected.snapshot));
    expect(expected.snapshot.image_sources).toBe('{}');
    expect(database.prepare(
      "SELECT content_hash FROM sync_object_state WHERE object_type = 'node' AND object_id = ?"
    ).get(version.object_id)).toEqual({ content_hash: version.content_hash });

    database.exec(`ATTACH DATABASE ':memory:' AS inc;
      CREATE TABLE inc.node_sync_versions AS SELECT * FROM main.node_sync_versions WHERE 0;
      CREATE TABLE inc.node_sync_version_parents AS SELECT * FROM main.node_sync_version_parents WHERE 0;
      CREATE TABLE inc.nodes AS SELECT * FROM main.nodes WHERE 0;`);
    const changed = { ...expected.snapshot, content: 'genuinely different body' };
    const changedHash = createHash('sha256').update(JSON.stringify(changed)).digest('hex');
    database.prepare(`INSERT INTO inc.node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(version.version_id, version.object_id, version.parent_version_id, version.host_name,
        version.created_at, changedHash, changed.content, JSON.stringify(changed));
    database.prepare('INSERT INTO inc.nodes (id, current_version_id) VALUES (?, ?)')
      .run(version.object_id, version.version_id);
    await expect(applySyncPackNodeVersionsWithDbPort(
      createBetterSqliteDbPort(database, { name: 'ios-immutable-conflict-contract' })
    )).rejects.toThrow(`sync_pack_node_version_immutable_mismatch:${version.version_id}`);
    expect(database.prepare('SELECT content_hash FROM node_sync_versions WHERE version_id = ?')
      .get(version.version_id)).toEqual({ content_hash: expected.content_hash });
    source.close();
    source = await createHostedPackTaskSource({ artifactRoot,
      oraclePackPath: 'scripts/ios/fixtures/acceptance-contract-corpus/sync-pack-runtime/legal.syncpack',
      sourceName: 'legal' });
    const historical = source.sqlite.prepare(
      "SELECT snapshot_json FROM node_sync_versions WHERE object_id = 'ios-acceptance-restore'"
    ).get();
    expect(JSON.parse(historical.snapshot_json)).not.toHaveProperty('image_sources');
  } finally {
    source?.close();
    fs.rmSync(artifactRoot, { recursive: true, force: true });
  }
});
