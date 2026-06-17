import { describe, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { WORKSPACE_STORAGE_KEY } from '../store/workspaceStore';

import { canonicalDemoPath, DEFAULT_DEMO_TOPIC, DEMO_TOPICS } from './demoContent';
import { createDemoWorkspaceSnapshot, installDemoWorkspaceSnapshot, resolveDemoTopicFromPath } from './demoWorkspaceSnapshot';

function requireTopic(index: number) {
  const topic = DEMO_TOPICS[index];
  if (!topic) {
    throw new Error(`Missing Demo topic fixture at index ${index}.`);
  }
  return topic;
}

describe('Demo workspace snapshot', () => {
  it('projects Demo topics into the Foliole workspace tree under Inbox', () => {
    const now = new Date('2026-06-17T00:00:00.000Z');
    const snapshot = createDemoWorkspaceSnapshot(canonicalDemoPath(requireTopic(0).slug), now);

    expect(snapshot.nodeOrder).toContain(INBOX_NODE_ID);
    expect(snapshot.nodesById[INBOX_NODE_ID]).toMatchObject({ specialKind: 'inbox', title: 'Inbox' });
    expect(snapshot.activeNodeId).toBe(`demo-${DEFAULT_DEMO_TOPIC?.slug}`);
    expect(snapshot.reviewSession.queueNodeIds).toHaveLength(DEMO_TOPICS.length);
    for (const topic of DEMO_TOPICS) {
      expect(snapshot.nodesById[`demo-${topic.slug}`]).toMatchObject({
        bodyStatus: 'ready',
        hasContent: true,
        kind: 'topic',
        parentNodeId: INBOX_NODE_ID,
        title: topic.title
      });
    }
  });

  it('selects the Demo topic that matches the current canonical path', () => {
    const selectedTopic = requireTopic(1);
    const snapshot = createDemoWorkspaceSnapshot(canonicalDemoPath(selectedTopic.slug), new Date('2026-06-17T00:00:00.000Z'));

    expect(resolveDemoTopicFromPath(canonicalDemoPath(selectedTopic.slug))).toBe(selectedTopic);
    expect(snapshot.activeNodeId).toBe(`demo-${selectedTopic.slug}`);
    expect(snapshot.reviewSession.currentNodeId).toBe(`demo-${selectedTopic.slug}`);
  });

  it('falls back to the first Demo topic for unknown paths', () => {
    expect(resolveDemoTopicFromPath('/demo/missing/')).toBe(DEFAULT_DEMO_TOPIC);
  });

  it('installs the Demo snapshot into the same storage key consumed by the desktop renderer', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value)
      },
      location: { pathname: canonicalDemoPath(requireTopic(0).slug) }
    });

    installDemoWorkspaceSnapshot();

    const payload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
    expect(payload.state.activeNodeId).toBe(`demo-${requireTopic(0).slug}`);
    expect(payload.state.nodesById[INBOX_NODE_ID]).toMatchObject({ specialKind: 'inbox' });
    vi.unstubAllGlobals();
  });
});
