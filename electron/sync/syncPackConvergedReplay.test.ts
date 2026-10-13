// @vitest-environment node
import { expect, it } from 'vitest';

import { buildResolutionRecord } from '../../lib/core/sync/syncNodeResolution.js';
import { restoreFixture } from '../database/requestSyncRestoreRecovery.testSupport.js';

import { branch, business, identity, receive } from './syncPackStoredVersionDependencies.testSupport.js';

const base = branch('base', 'Base', undefined, '2026-05-01T00:00:00.000Z');
const left = branch('left', 'Left branch', base, '2026-05-02T00:00:00.000Z');
const right = branch('right', 'Right branch', base, '2026-05-03T00:00:00.000Z');
const final = buildResolutionRecord([left, right], left, 'Converged');

it.each([false, true])('replays an unchanged converged version without rewriting its original history: identityOnly=%s', async identityOnly => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    await receive(source, target, [base, left, right, final]);
    const before = target.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all();
    await receive(source, target, [identityOnly ? identity(final) : final]); target.reopen();
    expect(target.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all()).toEqual(before);
    expect(target.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(final.version_id))
      .toBe('Converged');
  } finally { await fixture.close(); }
});

it.each(['changed-parents', 'missing-parent', 'wrong-object', 'changed-snapshot', 'cycle'] as const)(
  'rejects invalid request replay without changing retained history: %s', async mutation => {
    const fixture = await restoreFixture();
    const source = fixture.peer('source'); const target = fixture.peer('target');
    try {
      await receive(source, target, [base, left, right, final]);
      const before = business(target);
      const missing = branch('missing', 'Missing');
      let record = final;
      let error = `sync_pack_node_version_immutable_mismatch:${final.version_id}`;
      if (mutation === 'changed-parents') {
        record = { ...final, parent_version_id: left.version_id, parent_version_ids: [left.version_id!] };
        error = `node_version_parent_identity_mismatch:${final.version_id}`;
      } else if (mutation === 'missing-parent') {
        record = branch('new-head', 'New', missing); error = 'node_version_missing_parents:missing';
      } else if (mutation === 'wrong-object') {
        record = { ...final, object_id: 'other', snapshot: { ...final.snapshot, id: 'other' } };
        error = 'request_sync_object_identity_mismatch';
      } else if (mutation === 'changed-snapshot') {
        record = { ...final, snapshot: { ...final.snapshot, title: 'Changed' } };
      } else {
        record = branch('cycle', 'Cycle'); record.parent_version_id = 'cycle'; record.parent_version_ids = ['cycle'];
        error = 'node_version_graph_cycle';
      }
      await expect(receive(source, target, [record])).rejects.toThrow(error);
      target.reopen(); expect(business(target)).toEqual(before);
      expect(target.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id = 'base'").pluck().get()).toBe('Base');
    } finally { await fixture.close(); }
  });

it('rejects an identity-only current response before writing any receiver facts', async () => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  try {
    const before = business(target);
    await expect(receive(source, target, [identity(base)])).rejects.toThrow('request_sync_applied_state_missing');
    target.reopen(); expect(business(target)).toEqual(before);
  } finally { await fixture.close(); }
});
