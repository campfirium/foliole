// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { mutateTopicText } from '../../lib/core/sync/topicTextMutation.js';

import { transferTopicText } from './topicTextRequest.testSupport.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
function device() { const value = textDevice(); devices.push(value); return value; }
afterEach(() => { devices.splice(0).forEach((value) => value.sqlite.close()); });

async function forkedPair() {
  const left = device(); const right = device(); const base = textBranch('base', 'Base');
  const a = textBranch('a', 'Main longest body', base);
  await left.receive([base, a]);
  await left.receive([textBranch('b', 'B', base), textBranch('c', 'C', base)]);
  await transferTopicText(left, right);
  return { left, right };
}

async function choose(host: ReturnType<typeof device>, body: string, action: 'promoted' | 'dismissed', id: string) {
  const selected = host.sqlite.prepare("SELECT alternative_id FROM node_text_alternatives WHERE body_text=? AND status='available'")
    .get(body) as { alternative_id: string };
  await mutateTopicText(host.db, { nodeId: 'topic', alternativeId: selected.alternative_id, action,
    now: new Date().toISOString(), versionId: id, hostName: id });
}

it('keeps a newly adopted body when another device dismisses the old attachment', async () => {
  const { left, right } = await forkedPair();
  await choose(left, 'B', 'promoted', 'adopt-b'); await choose(right, 'B', 'dismissed', 'dismiss-b');
  await transferTopicText(left, right); await transferTopicText(right, left);
  const finalLeft = await left.current(); const finalRight = await right.current();
  expect(finalLeft.version_id).toBe(finalRight.version_id);
  expect(finalLeft.body_text).toBe('B');
  expect(await left.wholeBodies()).toEqual(new Set(['B', 'C']));
});

it('preserves both genuine new body choices when devices adopt different attachments', async () => {
  const { left, right } = await forkedPair();
  await choose(left, 'B', 'promoted', 'adopt-b'); await choose(right, 'C', 'promoted', 'adopt-c');
  await transferTopicText(left, right); await transferTopicText(right, left); await transferTopicText(left, right);
  const finalLeft = await left.current(); const finalRight = await right.current();
  expect(finalLeft.version_id).toBe(finalRight.version_id);
  expect(await left.wholeBodies()).toEqual(new Set(['B', 'C']));
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
  expect(await host.wholeBodies()).toEqual(new Set(['A', 'Longer body B']));
});
