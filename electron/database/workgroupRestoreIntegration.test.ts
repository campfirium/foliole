// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { applyPage, at, buildPage, database, nodeIds, seedNode,
  seedRestore, sourceId, targetId } from './workgroupRestoreIntegration.fixture.js';

let root = '';
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-t266-')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

for (const receiver of ['desktop', 'companion'] as const) {
  it(`${receiver} keeps the complete old library through interruption and adopts all pages after restart`, async () => {
    const source = database(sourceId, path.join(root, 'source.db'));
    let target = database(targetId, path.join(root, 'target.db'));
    try {
      seedNode(source, 'first', 1);
      seedNode(source, 'second', 2);
      seedNode(target, 'queued-before-restore');
      seedRestore(source, at);
      seedRestore(target, null);
      const first = await buildPage(source, root, 0, 1);
      const second = await buildPage(source, root, 1);
      await applyPage(receiver, target, 0, first);
      expect(nodeIds(target)).toEqual(['queued-before-restore']);
      expect(target.prepare('SELECT applied_at FROM sync_group_restore_events').get())
        .toEqual({ applied_at: null });
      target.close();
      target = database(targetId, path.join(root, 'target.db'));
      expect(nodeIds(target)).toEqual(['queued-before-restore']);
      await applyPage(receiver, target, 1, second);
      expect(nodeIds(target)).toEqual(['first', 'second']);
      expect(target.prepare('SELECT applied_at FROM sync_group_restore_events').get())
        .toEqual({ applied_at: expect.any(String) });
      await applyPage(receiver, target, second.frontier, second);
      expect(nodeIds(target)).toEqual(['first', 'second']);

    } finally { source.close(); target.close(); }
  });
}
