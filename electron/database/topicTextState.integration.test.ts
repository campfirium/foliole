// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { expireTopicText } from '../../lib/core/sync/topicTextExpiry.js';
import { mutateTopicText } from '../../lib/core/sync/topicTextMutation.js';
import { TEXT_ALTERNATIVE_LIFETIME_MS } from '../../lib/core/sync/topicTextState.js';

import { transferTopicText } from './topicTextRequest.testSupport.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
function device() { const value = textDevice(); devices.push(value); return value; }
afterEach(() => { devices.splice(0).forEach((value) => value.sqlite.close()); });

it('converges two forks to one whole version without combining their text', async () => {
  const left = device(); const right = device();
  const base = textBranch('base', 'one\ntwo');
  const a = textBranch('a', 'edited one\ntwo', base);
  const b = textBranch('b', 'one\nedited two', base);
  await left.receive([base, a]); await right.receive([base, b]);
  const l = await left.receive([b]); const r = await right.receive([a]);
  const settledLeft = await left.receive([r]);
  const settledRight = await right.receive([l]);
  expect(settledLeft.version_id).toBe(settledRight.version_id);
  expect(await left.wholeBodies()).toEqual(new Set([a.body_text, b.body_text]));
  expect(l.parent_version_ids).toEqual(['a', 'b']);
  expect((await left.receive([a, b, r])).version_id).toBe(settledLeft.version_id);
});

it('inherits attachments on edit and adopts one without preserving the displaced main body', async () => {
  const host = device(); const base = textBranch('base', 'base');
  await host.receive([base, textBranch('a', 'Main longest body', base)]);
  let current = await host.receive([textBranch('b', 'B', base), textBranch('c', 'C', base)]);
  expect(await host.alternatives()).toHaveLength(2);
  const originalAttachments = await host.alternatives();
  await applyLocalContentEdit(host.db, { baseVersionId: current.version_id!, versionId: 'edit',
    content: 'Main edited body', hideTitleHeading: false, hostName: 'host', nodeId: 'topic',
    title: 'Topic', updatedAt: new Date().toISOString() });
  current = await host.current();
  expect(await host.alternatives()).toEqual(originalAttachments);
  const selected = (await host.alternatives())[0]!;
  const body = host.sqlite.prepare('SELECT body_text FROM node_text_alternatives WHERE alternative_id=?').pluck().get(selected.id) as string;
  await mutateTopicText(host.db, { nodeId: 'topic', alternativeId: selected.id, action: 'promoted',
    now: new Date().toISOString(), versionId: 'adopt', hostName: 'host' });
  const adopted = await host.current();
  expect(adopted.body_text).toBe(body);
  expect(adopted.parent_version_ids).toEqual([current.version_id]);
  expect(await host.wholeBodies()).toEqual(new Set(['B', 'C']));
});

it('does not resurrect a dismissed attachment from a stale peer or concurrent ordinary edit', async () => {
  const left = device(); const right = device(); const base = textBranch('base', 'base');
  await left.receive([base, textBranch('a', 'Long main body', base)]);
  const merged = await left.receive([textBranch('b', 'B', base)]);
  await transferTopicText(left, right);
  await mutateTopicText(left.db, { nodeId: 'topic', alternativeId: (await left.alternatives())[0]!.id,
    action: 'dismissed', now: new Date().toISOString(), versionId: 'dismiss', hostName: 'left' });
  await right.receive([textBranch('edit', 'Long edited main body', merged)]);
  await transferTopicText(right, left); await transferTopicText(left, right);
  const l = await left.current(); const r = await right.current();
  expect(l.version_id).toBe(r.version_id);
  expect((await left.wholeBodies()).has('B')).toBe(false);
  const bodies = await left.wholeBodies();
  await left.receive([merged]);
  expect(await left.wholeBodies()).toEqual(bodies);
});

it('bounds alternative count and expires choices without changing the main version', async () => {
  const host = device(); const base = textBranch('base', 'base');
  await host.receive([base, textBranch('main', 'Main longest body', base)]);
  const merged = await host.receive(['b', 'c', 'd', 'e'].map((id) => textBranch(id, id, base)));
  expect(await host.alternatives()).toHaveLength(3);
  const future = new Date(Date.now() + TEXT_ALTERNATIVE_LIFETIME_MS + 1_000).toISOString();
  await expireTopicText(host.db, 'topic', future);
  const expired = await host.current();
  expect(await host.alternatives()).toEqual([]);
  expect(expired.version_id).toBe(merged.version_id);
  await host.receive([merged]);
  expect(await host.alternatives()).toEqual([]);
});
