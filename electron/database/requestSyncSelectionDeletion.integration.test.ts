// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { applyFramedFactSources } from '../../lib/core/sync/framedSyncFactApply.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

async function selection(source: ReturnType<typeof textDevice>) {
  const entry = await readFramedSyncInventoryEntry(source.db, { objectType: 'node', globalId: 'topic' });
  return compareFramedSyncInventories({ local: entry ? [entry] : [], remote: [] })[0]!;
}

it.each([false, true])('does not resurrect after a tombstone and old delivery, receiver history purged=%s', async purgeHistory => {
  const source = textDevice(); const target = textDevice();
  const root = await mkdtemp(path.join(os.tmpdir(), 't360-deletion-'));
  try {
    const v1 = textBranch('v1', 'Original');
    await applyConvergentSyncNodesWithDbPort(source.db, [v1], { collectVersionPayloads: false });
    const old = await selection(source);
    const deleted = { ...textBranch('deleted', 'Original', v1), is_tombstone: true };
    deleted.snapshot.deleted_at = new Date().toISOString();
    await applyConvergentSyncNodesWithDbPort(source.db, [deleted], { collectVersionPayloads: false });
    const send = async (difference: typeof old) => withRequestSyncFiles(createDesktopFramedSyncFiles(root), async files => {
      const selected = await writeRequestSyncSnapshot(source.db, difference, files);
      await applyFramedFactSources(target.db, [() => files.readFacts()], {
        requireCompleteVersionGraph: true, loadBody: (_db, blob) => files.loadBody(blob),
        currentVersion: { globalId: 'topic', versionId: selected.currentVersionId! }
      });
    });
    await send(old);
    expect((await target.current()).version_id).toBe('v1');
    await send(await selection(source));
    expect(await target.db.query("SELECT id FROM nodes WHERE id = 'topic'")).toEqual([]);
    if (purgeHistory) {
      await target.db.run("DELETE FROM node_sync_version_parents");
      await target.db.run("DELETE FROM node_sync_versions");
    } else {
      await send({ ...old, need: { frontierFactIds: [], requiredRelationIds: [], reviewFactIds: [],
        stateFactIds: [], resourceHashes: [], sharedState: true } });
      expect(await target.db.query("SELECT id FROM nodes WHERE id = 'topic'")).toEqual([]);
    }
    await send(old);
    expect(await target.db.query("SELECT id FROM nodes WHERE id = 'topic'")).toEqual([]);
    expect(await target.db.query("SELECT version_id FROM node_sync_tombstones WHERE node_id = 'topic'"))
      .toEqual([{ version_id: 'deleted' }]);
  } finally { source.sqlite.close(); target.sqlite.close(); await rm(root, { recursive: true, force: true }); }
});

it('defers the entire object after the selected version is physically purged', async () => {
  const source = textDevice();
  const root = await mkdtemp(path.join(os.tmpdir(), 't360-purge-'));
  try {
    await source.receive([textBranch('v1', 'Original')]);
    const old = await selection(source);
    await source.db.run("DELETE FROM node_sync_versions WHERE version_id = 'v1'");
    await withRequestSyncFiles(createDesktopFramedSyncFiles(root), async files => {
      await expect(writeRequestSyncSnapshot(source.db, old, files)).rejects.toThrow('framed_sync_source_changed');
      const facts = [];
      for await (const fact of files.readFacts()) facts.push(fact);
      expect(facts).toEqual([]);
    });
  } finally { source.sqlite.close(); await rm(root, { recursive: true, force: true }); }
});
