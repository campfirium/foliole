// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';

import { permanentlyDelete } from './dynamicNodeVersionChains.delete.testSupport.js';
import { closeLibraries, createPeer, joinPeers, startLibraries } from './syncLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from './syncRequestSnapshot.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('sends the permanent deletion of a topic that still listed another device\'s text', async () => {
  const source = createPeer('source');
  const target = createPeer('target');
  joinPeers(source, target);
  const at = '2026-09-30T00:00:00.000Z';
  const record = textBranch('with-alternative', 'Current body', undefined, at);
  const other = 'Text kept from the phone';
  record.snapshot.text_alternatives = [{ id: 'alternative#phone', body_blob_hash: hashTextBody(other),
    source_host_name: 'phone', created_at: at, expires_at: '2026-10-30T00:00:00.000Z' }];
  record.alternative_bodies = [{ hash: hashTextBody(other), text: other }];
  await applySyncNodesWithDbPort(source.port, [record]);
  await withLibraryRequestSnapshot(source, target, replay => replay());
  const deletion = permanentlyDelete(source);

  await withLibraryRequestSnapshot(source, target, replay => replay());

  expect(target.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
  expect(target.db.prepare("SELECT version_id FROM node_sync_tombstones WHERE node_id = 'topic'").pluck().get())
    .toBe(deletion.version_id);
});
