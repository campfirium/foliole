// @vitest-environment node
import { expect, it } from 'vitest';

import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { releaseLocalEditBase, retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { loadRetainedSyncNodeVersionFact } from '../../lib/core/sync/syncNodeGraph.js';
import { branch, receive } from '../sync/syncPackStoredVersionDependencies.testSupport.js';

import { restoreFixture } from './requestSyncRestoreRecovery.testSupport.js';

it.each(['folder', 'item'] as const)('keeps the original received retirement behavior for %s', async kind => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  try {
    const base = branch('base', 'Original');
    base.snapshot.kind = kind;
    const head = branch('head', 'Current', base);
    head.snapshot.kind = kind;
    await receive(source, target, [base, head]);
    await receive(source, target, [{ ...base, body_text: null,
      snapshot: { ...base.snapshot, content: null, body_deleted: true } }]);
    expect((await loadRetainedSyncNodeVersionFact(target.db, 'base'))!.snapshot.body_deleted).toBe(true);
    expect((await loadRetainedSyncNodeVersionFact(target.db, 'head'))!.body_text).toBe('Current');
  } finally { await fixture.close(); }
});

it('preserves a local noncurrent branch on a real deleted-only request and retires it after its merge arrives', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  try {
    const base = branch('base', 'Original');
    const head = branch('head', 'Current', base);
    const fork = branch('fork', 'Local branch input', base);
    await receive(source, target, [base, head]);
    await upsertRemoteVersion(target.db, fork);
    await receive(source, target, [{ ...fork, body_text: null,
      snapshot: { ...fork.snapshot, content: null, body_deleted: true } }]);
    expect((await loadRetainedSyncNodeVersionFact(target.db, 'fork'))!.body_text).toBe('Local branch input');
    const merged = { ...branch('merged', 'Merged complete body', head), parent_version_ids: ['head', 'fork'] };
    await receive(source, target, [merged]);
    target.reopen();
    expect((await loadRetainedSyncNodeVersionFact(target.db, 'fork'))!.snapshot.body_deleted).toBe(true);
    expect((await loadRetainedSyncNodeVersionFact(target.db, 'merged'))!.body_text).toBe('Merged complete body');
  } finally { await fixture.close(); }
});

it('preserves an uncarried baseline alternative payload on a real deleted-only request', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source');
  const target = fixture.peer('target');
  try {
    const hash = hashTextBody('Still needed baseline alternative');
    const base = branch('base', 'Original');
    base.snapshot.text_alternatives = [{ id: 'alternative', body_blob_hash: hash, source_host_name: 'peer',
      created_at: new Date().toISOString(), expires_at: '2099-01-01T00:00:00Z' }];
    base.alternative_bodies = [{ hash, text: 'Still needed baseline alternative' }];
    await receive(source, target, [base]);
    await retainLocalEditBase(target.db, { holdId: 'editor', nodeId: 'node-1', versionId: 'base' });
    const head = branch('head', 'Current', base);
    head.snapshot.text_alternatives = []; delete head.alternative_bodies;
    await receive(source, target, [head]);
    await receive(source, target, [{ ...base, body_text: null, alternative_bodies: [],
      snapshot: { ...base.snapshot, content: null, body_deleted: true } }]);
    expect((await loadRetainedSyncNodeVersionFact(target.db, 'base'))!.alternative_bodies).toEqual(base.alternative_bodies);
    await releaseLocalEditBase(target.db, 'editor', 'node-1');
    target.reopen();
    expect((await loadRetainedSyncNodeVersionFact(target.db, 'base'))!.snapshot.body_deleted).toBe(true);
  } finally { await fixture.close(); }
});
