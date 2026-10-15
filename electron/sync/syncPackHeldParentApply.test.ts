// @vitest-environment node
import { expect, it } from 'vitest';

import { restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';

import { branch, receive, retiredVersionRow } from './syncPackStoredVersionDependencies.testSupport.js';

it('applies a new requested head when the response omits an already held parent body', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const parent = branch('desktop#1', '', undefined, '2026-05-04T01:00:00.000Z');
    await receive(source, target, [parent]);
    const original = target.sqlite.prepare<[], Record<string, unknown> & { snapshot_json: string }>(
      "SELECT * FROM node_sync_versions WHERE version_id = 'desktop#1'").get()!;
    const head = branch('desktop#2', '', parent);
    for (let replay = 0; replay < 2; replay++) {
      await receive(source, target, [head]); target.reopen();
      expect(target.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'node-1'").get())
        .toEqual({ current_version_id: 'desktop#2' });
      expect(target.sqlite.prepare("SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = 'desktop#2'").get())
        .toEqual({ parent_version_id: 'desktop#1' });
      expect(target.sqlite.prepare("SELECT * FROM node_sync_versions WHERE version_id = 'desktop#1'").get()).toEqual(retiredVersionRow(original));
    }
  } finally { await fixture.close(); }
});
