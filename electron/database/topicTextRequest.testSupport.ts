import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { applyFramedFactSources } from '../../lib/core/sync/framedSyncFactApply.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import type { textDevice } from './topicTextState.testSupport.js';

type Device = ReturnType<typeof textDevice>;

/** Serialize and apply actual node and child facts, rather than passing only the main-body version. */
export async function transferTopicText(source: Device, target: Device) {
  const key = { objectType: 'node', globalId: 'topic' };
  const local = await readFramedSyncInventoryEntry(source.db, key);
  const remote = await readFramedSyncInventoryEntry(target.db, key);
  const difference = compareFramedSyncInventories({ local: local ? [local] : [], remote: remote ? [remote] : [] })
    .find(value => value.direction === 'local_to_remote');
  if (!difference) return;
  await mkdir('.tmp/artifacts', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/topic-text-request-'));
  try {
    await withRequestSyncFiles(createDesktopFramedSyncFiles(root), async request => {
      await writeRequestSyncSnapshot(source.db, difference, request);
      await applyFramedFactSources(target.db, [() => request.readFacts()], {
        requireCompleteVersionGraph: true, loadBody: (_db, blob) => request.loadBody(blob),
        currentVersion: { globalId: 'topic', versionId: difference.sourceSnapshot.currentVersionId! }
      });
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}
