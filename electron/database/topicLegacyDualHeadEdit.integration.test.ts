// @vitest-environment node
import { writeFile } from 'node:fs/promises';

import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';

import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';

import { legacyHistoryRuntime } from './legacyHistoryRuntime.testSupport.js';
import { closeLibraries, createPeer, joinPeers, startLibraries } from './syncLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from './syncRequestSnapshot.testSupport.js';
import { textBranch, wholeBodies } from './topicTextState.testSupport.js';

let legacy: Awaited<ReturnType<typeof legacyHistoryRuntime>>;
beforeAll(async () => { legacy = await legacyHistoryRuntime(); });
afterAll(async () => { await legacy.close(); });
beforeEach(startLibraries);
afterEach(closeLibraries);

it.each(['legacy', 'current'] as const)('records subsequent editing of pre-selection equal-body heads on %s', async mode => {
  const initialize = mode === 'legacy' ? legacy.runtime.initializeDatabaseSchema : undefined;
  const a = createPeer('a', initialize);
  const b = createPeer('b', initialize);
  joinPeers(a, b);
  const base = textBranch('base', 'Original');
  const left = textBranch('left', 'Shared complete body', base);
  const right = textBranch('right', 'Shared complete body', base);
  for (const record of [base, left, right]) delete record.snapshot.text_selection;
  for (const peer of [a, b]) {
    await applyConvergentSyncNodesWithDbPort(peer.port, [base, left], { collectVersionPayloads: false });
    await upsertRemoteVersion(peer.port, right);
  }
  const runtime = mode === 'legacy' ? legacy.runtime : { applyLocalContentEdit, applyRequestSyncObject, writeRequestSyncSnapshot };
  await runtime.applyLocalContentEdit(a.port, { nodeId: 'topic', baseVersionId: 'left', versionId: 'edited',
    content: 'New complete user input', title: 'Topic', hideTitleHeading: false,
    hostName: 'a', updatedAt: new Date().toISOString() });
  await withLibraryRequestSnapshot(a, b, replay => replay(), runtime);
  const current = (await loadCurrentSyncNodeRecord(b.port, 'topic'))!;
  expect(wholeBodies(current)).toContain('New complete user input');
  await writeFile(`.tmp/artifacts/t349-dual-head-edit-${mode}.json`, JSON.stringify({ mode,
    currentBody: current.body_text, alternatives: current.alternative_bodies,
    parents: current.parent_version_ids }, null, 2));
});
