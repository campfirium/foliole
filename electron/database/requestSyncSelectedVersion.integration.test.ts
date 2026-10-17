// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import type { CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { withRequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { textDevice, textBranch } from './topicTextState.testSupport.js';

it('delivers a retained selected version after the source advances without changing a prepared payload', async () => {
  const source = textDevice();
  const root = await mkdtemp(path.join(os.tmpdir(), 't360-source-'));
  const files = createDesktopFramedSyncFiles(root);
  try {
    const v1 = textBranch('v1', 'First persisted body');
    await applyConvergentSyncNodesWithDbPort(source.db, [v1], { collectVersionPayloads: false });
    const entry = await readFramedSyncInventoryEntry(source.db, { objectType: 'node', globalId: 'topic' });
    const [selection] = compareFramedSyncInventories({ local: [entry!], remote: [] });
    const before = await source.db.query("SELECT version_id, content_hash, body_text FROM node_sync_versions WHERE version_id = 'v1'");
    await withRequestSyncFiles(files, async prepared => {
      await writeRequestSyncSnapshot(source.db, selection!, prepared);
      const factsBefore: CanonicalFact[] = [];
      for await (const fact of prepared.readFacts()) factsBefore.push(fact);
      await applyConvergentSyncNodesWithDbPort(source.db, [textBranch('v2', 'Second persisted body', v1)], { collectVersionPayloads: false });
      expect((await source.current()).version_id).toBe('v2');
      expect(await source.db.query("SELECT version_id, content_hash, body_text FROM node_sync_versions WHERE version_id = 'v1'")).toEqual(before);
      await withRequestSyncFiles(files, async fresh => {
        const selected = await writeRequestSyncSnapshot(source.db, selection!, fresh);
        expect(selected.currentVersionId).toBe('v1');
        const facts = [];
        for await (const fact of fresh.readFacts()) facts.push(fact);
        expect(facts).toEqual(factsBefore);
      });
      const factsAfter = [];
      for await (const fact of prepared.readFacts()) factsAfter.push(fact);
      expect(factsAfter).toEqual(factsBefore);
      expect(factsAfter.length).toBeGreaterThan(0);
    });
  } finally { source.sqlite.close(); await rm(root, { recursive: true, force: true }); }
});

it('defers the whole object when its selected current body has been collected', async () => {
  const source = textDevice();
  const root = await mkdtemp(path.join(os.tmpdir(), 't360-collected-'));
  try {
    const v1 = textBranch('v1', 'First body');
    await applyConvergentSyncNodesWithDbPort(source.db, [v1], { collectVersionPayloads: false });
    const entry = await readFramedSyncInventoryEntry(source.db, { objectType: 'node', globalId: 'topic' });
    const [selection] = compareFramedSyncInventories({ local: [entry!], remote: [] });
    await applyConvergentSyncNodesWithDbPort(source.db, [textBranch('v2', 'Second body', v1)],
      { collectVersionPayloads: false });
    expect((await collectNodeVersionPayloads(source.db, 'topic')).released).toBe(1);
    await withRequestSyncFiles(createDesktopFramedSyncFiles(root), async files => {
      await expect(writeRequestSyncSnapshot(source.db, selection!, files)).rejects.toThrow('framed_sync_source_changed');
      const facts = [];
      for await (const fact of files.readFacts()) facts.push(fact);
      expect(facts).toEqual([]);
    });
  } finally { source.sqlite.close(); await rm(root, { recursive: true, force: true }); }
});
