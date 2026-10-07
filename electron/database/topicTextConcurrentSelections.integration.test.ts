// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { mutateTopicText } from '../../lib/core/sync/topicTextMutation.js';

import { textBranch, textDevice, wholeBodies } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
function device() { const value = textDevice(); devices.push(value); return value; }
afterEach(() => { devices.splice(0).forEach((value) => value.sqlite.close()); });

async function forkedPair() {
  const left = device(); const right = device(); const base = textBranch('base', 'Base');
  const a = textBranch('a', 'Main longest body', base);
  await left.receive([base, a]);
  const merged = await left.receive([textBranch('b', 'B', base), textBranch('c', 'C', base)]);
  await right.receive([base, a, merged]);
  return { left, right, merged };
}

async function choose(host: ReturnType<typeof device>, body: string, action: 'promoted' | 'dismissed', id: string) {
  const current = await host.current();
  const hash = current.alternative_bodies!.find((entry) => entry.text === body)!.hash;
  const selected = current.snapshot.text_alternatives!.find((entry) => entry.body_blob_hash === hash)!;
  await mutateTopicText(host.db, { nodeId: 'topic', alternativeId: selected.id, action,
    now: new Date().toISOString(), versionId: id, hostName: id });
}

it('keeps a newly adopted body when another device dismisses the old attachment', async () => {
  const { left, right } = await forkedPair();
  await choose(left, 'B', 'promoted', 'adopt-b'); await choose(right, 'B', 'dismissed', 'dismiss-b');
  const l = await left.current(); const r = await right.current();
  const finalLeft = await left.receive([r]); const finalRight = await right.receive([l]);
  expect(finalLeft.version_id).toBe(finalRight.version_id);
  expect(finalLeft.body_text).toBe('B');
  expect(wholeBodies(finalLeft)).toEqual(new Set(['B', 'C']));
});

it('preserves both genuine new body choices when devices adopt different attachments', async () => {
  const { left, right } = await forkedPair();
  await choose(left, 'B', 'promoted', 'adopt-b'); await choose(right, 'C', 'promoted', 'adopt-c');
  const l = await left.current(); const r = await right.current();
  const firstLeft = await left.receive([r]); const firstRight = await right.receive([l]);
  const finalLeft = await left.receive([firstRight]); const finalRight = await right.receive([firstLeft]);
  expect(finalLeft.version_id).toBe(finalRight.version_id);
  expect(wholeBodies(finalLeft)).toEqual(new Set(['B', 'C']));
});

it('keeps same-host independent forks and ranks main bodies by associated children first', async () => {
  const host = device(); const base = textBranch('base', 'Base');
  const a = { ...textBranch('a', 'A', base), host_name: 'same-host' };
  const b = { ...textBranch('b', 'Longer body B', base), host_name: 'same-host' };
  await host.receive([base, a]);
  await host.db.run(`INSERT INTO nodes (id, kind, title, parent_id, anchor_source_version_id, created_at, updated_at)
    VALUES ('child', 'item', 'Child', 'topic', 'a', ?, ?)`, [base.updated_at, base.updated_at]);
  const merged = await host.receive([b]);
  expect(merged.body_text).toBe('A');
  expect(wholeBodies(merged)).toEqual(new Set(['A', 'Longer body B']));
});
