// @vitest-environment node
import { expect, it } from 'vitest';

import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { nodeVersionChainMetadataSql } from '../../lib/core/sync/nodeVersionChainMetadata.js';
import { planNodeVersionChain, planNodeVersionMetadataChain, type ChainVersion, type ChainVersionMetadata } from '../../lib/core/sync/nodeVersionChainPlan.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';

import { observeReads } from './syncNodeVerifiedTopicConflict.testSupport.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

it('preserves retention decisions with metadata flags in continuous and stable storage without reading historical bodies', async () => {
  const host = textDevice();
  try {
    const base = textBranch('base', 'Original', undefined, '2026-10-07T00:00:00.000Z');
    const local = textBranch('local', 'x'.repeat(3 * 1024 * 1024), base);
    const remote = textBranch('remote', 'Concurrent', base);
    const retired = { ...base, version_id: 'retired', body_text: null,
      snapshot: { ...base.snapshot, content: null, body_blob_hash: null } };
    for (const record of [base, local, remote, retired]) await upsertRemoteVersion(host.db, record);
    const versions = await host.db.query<ChainVersion>('SELECT * FROM node_sync_versions WHERE object_id = ?', ['topic']);
    const edges = await host.db.query<{ version_id: string; parent_version_id: string; ordinal: number }>(
      'SELECT * FROM node_sync_version_parents');
    const expected = planNodeVersionChain(versions, edges, new Set(['local', 'remote']), new Set(), 100, new Set(['local']));
    const reads = observeReads(host.db);
    const continuous = await reads.port.query<ChainVersionMetadata>(nodeVersionChainMetadataSql(), ['topic']);
    expect(planNodeVersionMetadataChain(continuous, edges, new Set(['local', 'remote']), new Set(), 100, new Set(['local'])))
      .toEqual(expected);
    expect(reads.sizes).toEqual([]);
    await migrateBodyContentStorage(host.db);
    const stable = await reads.port.query<ChainVersionMetadata>(nodeVersionChainMetadataSql('chunked'), ['topic']);
    expect(planNodeVersionMetadataChain(stable, edges, new Set(['local', 'remote']), new Set(), 100, new Set(['local'])))
      .toEqual(expected);
    expect(reads.sizes).toEqual([]);
    host.sqlite.prepare("DELETE FROM content_bodies WHERE hash = (SELECT body_blob_hash FROM node_sync_versions WHERE version_id = 'local')").run();
    const unavailable = await reads.port.query<ChainVersionMetadata>(nodeVersionChainMetadataSql('chunked'), ['topic']);
    expect(planNodeVersionMetadataChain(unavailable, edges, new Set(['local', 'remote']), new Set(), 100, new Set(['local'])).skipped)
      .toBe('protected_body_unavailable');
  } finally { host.sqlite.close(); }
});
