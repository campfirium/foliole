import { expect, it } from 'vitest';

import { hasConfirmedIncomingNodeDescendant } from '../../lib/core/sync/incomingNodeVersionDescendants.js';
import {
  blocksIncomingNodeVersion,
  decideIncomingNodeApply,
  isRemoteFastForward,
  latestBranchHeadRecords,
  orderNodesForApply
} from '../../lib/core/sync/syncNodeApplyRules.js';
import { buildResolutionRecord } from '../../lib/core/sync/syncNodeResolution.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

function createNodeRecord(overrides: Partial<NativeSyncNodeRecord> & Pick<NativeSyncNodeRecord, 'object_id'>): NativeSyncNodeRecord {
  const { object_id, ...rest } = overrides;
  return {
    ancestor_version_ids: [],
    content_hash: null,
    host_name: 'phone',
    object_id,
    object_type: 'node',
    parent_version_id: null,
    snapshot: {
      anchor_link: null,
      attachments: [],
      content: '',
      created_at: '2026-04-21T10:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      hide_title_heading: false,
      id: object_id,
      image_regions: null,
      is_title_manual: false,
      kind: 'item',
      opening_text: null,
      parent_id: null,
      position: null,
      priority: null,
      reveal: null,
      title: object_id,
      updated_at: '2026-04-21T11:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-04-21T11:00:00.000Z',
    version_created_at: '2026-04-21T11:00:00.000Z',
    version_id: `${object_id}#1`,
    ...rest
  };
}

it('keeps only the latest head per remote branch', () => {
  expect(
    latestBranchHeadRecords([
      createNodeRecord({
        object_id: 'node-1',
        version_created_at: '2026-04-21T11:00:00.000Z',
        version_id: 'phone#1'
      }),
      createNodeRecord({
        object_id: 'node-1',
        version_created_at: '2026-04-21T12:00:00.000Z',
        version_id: 'phone#2'
      }),
      createNodeRecord({
        host_name: 'tablet',
        object_id: 'node-1',
        version_created_at: '2026-04-21T11:30:00.000Z',
        version_id: 'tablet#1'
      })
    ]).map((record) => record.version_id)
  ).toEqual(['phone#2', 'tablet#1']);
});

it('recognizes history consumed by a confirmed incoming descendant through explicit parent edges', () => {
  const history = createNodeRecord({ object_id: 'node-1', version_id: 'old' });
  const middle = createNodeRecord({ object_id: 'node-1', version_id: 'middle', parent_version_ids: ['old'] });
  const head = createNodeRecord({ object_id: 'node-1', version_id: 'head', parent_version_ids: ['middle'] });
  expect(hasConfirmedIncomingNodeDescendant(history, [history, middle, head], new Set(['head']))).toBe(true);
  expect(hasConfirmedIncomingNodeDescendant(history, [history, middle, head], new Set())).toBe(false);
});

it('does not consume a conflict from an unproven ancestor claim or another object', () => {
  const history = createNodeRecord({ object_id: 'node-1', version_id: 'old' });
  const claimed = createNodeRecord({ object_id: 'node-1', version_id: 'claimed', ancestor_version_ids: ['old'] });
  const other = createNodeRecord({ object_id: 'node-2', version_id: 'other', parent_version_ids: ['old'] });
  expect(hasConfirmedIncomingNodeDescendant(history, [history, claimed, other], new Set(['claimed', 'other']))).toBe(false);
});

it('does not infer a descendant through missing intermediate history', () => {
  const history = createNodeRecord({ object_id: 'node-1', version_id: 'old' });
  const head = createNodeRecord({ object_id: 'node-1', version_id: 'head', parent_version_ids: ['missing'],
    ancestor_version_ids: ['missing', 'old'] });
  expect(hasConfirmedIncomingNodeDescendant(history, [history, head], new Set(['head']))).toBe(false);
});

it('recognizes a consumed branch only when its heads reconstruct the confirmed resolution identity', () => {
  const original = createNodeRecord({ object_id: 'node-1', version_id: 'original' });
  original.snapshot.kind = 'topic';
  const left = { ...original, version_id: 'left', parent_version_ids: ['original'] };
  const right = { ...original, version_id: 'right', parent_version_ids: ['original'] };
  const resolution = buildResolutionRecord([left, right], left, 'Final body');
  resolution.parent_version_ids = ['right'];
  resolution.parent_version_id = 'right';
  const records = [original, left, right, resolution];
  expect(hasConfirmedIncomingNodeDescendant(left, records, new Set([resolution.version_id]))).toBe(true);
  expect(hasConfirmedIncomingNodeDescendant(left, records, new Set())).toBe(false);
  const unrelated = { ...left, version_id: 'unrelated' };
  expect(hasConfirmedIncomingNodeDescendant(unrelated, [...records, unrelated], new Set([resolution.version_id]))).toBe(false);
  const altered = { ...resolution, body_text: 'Different body' };
  expect(hasConfirmedIncomingNodeDescendant(left, [left, right, altered], new Set([altered.version_id]))).toBe(false);
});

it('orders child nodes after their included parent node', () => {
  const child = createNodeRecord({
    object_id: 'child',
    snapshot: {
      ...createNodeRecord({ object_id: 'child' }).snapshot,
      parent_id: 'parent'
    }
  });
  const parent = createNodeRecord({ object_id: 'parent' });

  expect(orderNodesForApply([child, parent]).map((record) => record.object_id)).toEqual(['parent', 'child']);
});

it('classifies remote fast-forward ancestry', () => {
  expect(isRemoteFastForward(createNodeRecord({ object_id: 'node-1', version_id: 'local#1' }), 'local#1')).toBe(true);
  expect(isRemoteFastForward(createNodeRecord({ object_id: 'node-1', parent_version_id: 'local#1' }), 'local#1')).toBe(true);
  expect(
    isRemoteFastForward(createNodeRecord({ ancestor_version_ids: ['local#1'], object_id: 'node-1' }), 'local#1')
  ).toBe(true);
  expect(isRemoteFastForward(createNodeRecord({ object_id: 'node-1', parent_version_id: 'other#1' }), 'local#1')).toBe(false);
});

it('blocks stale active remote versions from overwriting local dirty or deleted nodes', () => {
  const activeRemote = createNodeRecord({ object_id: 'node-1', version_id: 'phone#1' });
  const deletedRemote = createNodeRecord({
    object_id: 'node-1',
    snapshot: {
      ...activeRemote.snapshot,
      deleted_at: '2026-04-21T12:00:00.000Z'
    },
    version_id: 'phone#delete'
  });

  expect(blocksIncomingNodeVersion({ current_version_id: 'desktop#1', deleted_at: null, sync_dirty: 1 }, activeRemote)).toBe(true);
  expect(blocksIncomingNodeVersion({ current_version_id: 'desktop#1', deleted_at: '2026-04-21T12:00:00.000Z', sync_dirty: 0 }, activeRemote)).toBe(true);
  expect(blocksIncomingNodeVersion({ current_version_id: 'desktop#1', deleted_at: null, sync_dirty: 1 }, deletedRemote)).toBe(false);
  expect(blocksIncomingNodeVersion({ current_version_id: 'phone#1', deleted_at: null, sync_dirty: 1 }, activeRemote)).toBe(false);
});

it('decides incoming node apply outcomes from local state and version ancestry', () => {
  expect(decideIncomingNodeApply(null, createNodeRecord({ object_id: 'node-1' }))).toBe('apply_missing_local');
  expect(
    decideIncomingNodeApply(
      { current_version_id: 'desktop#1', deleted_at: null, sync_dirty: 0 },
      createNodeRecord({ object_id: 'node-1', parent_version_id: 'desktop#1', version_id: 'phone#2' })
    )
  ).toBe('apply_fast_forward');
  expect(
    decideIncomingNodeApply(
      { current_version_id: 'phone#1', deleted_at: null, sync_dirty: 0 },
      createNodeRecord({ object_id: 'node-1', version_id: 'phone#1' })
    )
  ).toBe('already_applied');
  expect(
    decideIncomingNodeApply(
      { current_version_id: 'desktop#1', deleted_at: null, sync_dirty: 1 },
      createNodeRecord({ object_id: 'node-1', version_id: 'phone#2' })
    )
  ).toBe('record_conflict');
  expect(
    decideIncomingNodeApply(
      { current_version_id: 'desktop#1', deleted_at: null, sync_dirty: 1 },
      createNodeRecord({ object_id: 'node-1', parent_version_id: 'desktop#1', version_id: 'phone#2' })
    )
  ).toBe('block_incoming');
  expect(
    decideIncomingNodeApply(
      { current_version_id: 'desktop#2', deleted_at: null, sync_dirty: 0 },
      createNodeRecord({ object_id: 'node-1', parent_version_id: 'desktop#1', version_id: 'phone#2' })
    )
  ).toBe('record_conflict');
});
