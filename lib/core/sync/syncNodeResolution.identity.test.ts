import { expect, it } from 'vitest';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import { buildResolutionRecord } from './syncNodeResolution.js';

function record(version: string): NativeSyncNodeRecord {
  const time = '2026-09-20T00:00:00.000Z';
  return {
    ancestor_version_ids: ['older', 'base'], body_text: 'Body', content_hash: version,
    host_name: version, object_id: 'topic', object_type: 'node', parent_version_id: 'base',
    snapshot: { id: 'topic', content: 'Body', title: 'Title', attachments: [
      { attachment_id: 'b', role: 'image' }, { attachment_id: 'a', role: 'image' }
    ], created_at: time, updated_at: time } as NativeSyncNodeRecord['snapshot'],
    updated_at: time, version_created_at: time, version_id: version
  };
}

it('binds version identity to metadata as well as body and parents', () => {
  const a = record('a');
  const b = record('b');
  const original = buildResolutionRecord([a, b], a, 'Body');
  const renamed = buildResolutionRecord([a, b], { ...a, snapshot: { ...a.snapshot, title: 'Renamed' } }, 'Body');
  expect(renamed.content_hash).not.toBe(original.content_hash);
  expect(renamed.version_id).not.toBe(original.version_id);
});

it('normalizes field order, attachment sets, optional nulls and ancestor order', () => {
  const a = record('a');
  const b = record('b');
  const original = buildResolutionRecord([a, b], a, 'Body');
  const reordered = {
    ...a, ancestor_version_ids: [...a.ancestor_version_ids].reverse(),
    snapshot: {
      ...Object.fromEntries(Object.entries(a.snapshot).reverse()),
      attachments: [...a.snapshot.attachments].reverse(),
      enable_short_term: null, image_sources: null
    } as NativeSyncNodeRecord['snapshot']
  };
  const equivalent = buildResolutionRecord([b, reordered], reordered, 'Body');
  expect(equivalent).toEqual(original);
  expect(a.snapshot.attachments.map((item) => item.attachment_id)).toEqual(['b', 'a']);
});

it('retains explicit false instead of collapsing it into inherited null', () => {
  const a = record('a');
  const b = record('b');
  const inherited = buildResolutionRecord([a, b], a, 'Body');
  const disabled = buildResolutionRecord([a, b], {
    ...a, snapshot: { ...a.snapshot, enable_short_term: false }
  }, 'Body');
  expect(disabled.snapshot.enable_short_term).toBe(false);
  expect(disabled.version_id).not.toBe(inherited.version_id);
});
