import { expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { createInitialWorkspaceState, useWorkspaceStore, WORKSPACE_STORAGE_KEY } from '../store/workspaceStore';

import { canonicalGuidePath, DEFAULT_DEMO_TOPIC, DEMO_TOPICS, getDemoTopicNodeId } from './demoContent';
import {
  DEMO_GUIDES_NODE_ID,
  DEMO_GUIDES_TITLE
} from './demoGuides';
import { clearDemoLocalStorage, readDemoPreviewDay, writeDemoPreviewDay } from './demoLocalStorage';
import {
  createDemoWorkspaceSnapshot,
  installDemoWorkspaceSnapshot,
  resolveDemoTopicFromPath
} from './demoWorkspaceSnapshot';

function requireTopic(index: number) {
  const topic = DEMO_TOPICS[index];
  if (!topic) {
    throw new Error(`Missing Demo topic fixture at index ${index}.`);
  }
  return topic;
}

it('projects the guided sample tree into the Foliole Demo workspace under Guides', () => {
    const now = new Date('2026-06-17T00:00:00.000Z');
    const topic = requireTopic(0);
    const snapshot = createDemoWorkspaceSnapshot(canonicalGuidePath(topic.slug), now);
    const topicNodeId = getDemoTopicNodeId(topic);
    const childNodeIds = DEMO_TOPICS.slice(1).map(getDemoTopicNodeId);
    const welcome = snapshot.nodesById[topicNodeId];

    expect(snapshot.nodeOrder).toContain(INBOX_NODE_ID);
    expect(snapshot.nodesById[INBOX_NODE_ID]).toMatchObject({ specialKind: 'inbox', title: 'Inbox' });
    expect(snapshot.nodesById[DEMO_GUIDES_NODE_ID]).toMatchObject({
      kind: 'folder',
      manualChildOrder: [topicNodeId],
      title: DEMO_GUIDES_TITLE
    });
    expect(snapshot.activeNodeId).toBe(topicNodeId);
    expect(snapshot.reviewSession.currentNodeId).toBe(topicNodeId);
    expect(snapshot.reviewSession.queueNodeIds).toEqual([topicNodeId]);
    expect(welcome).toMatchObject({
      bodyStatus: 'ready',
      kind: 'topic',
      manualChildOrder: childNodeIds,
      parentNodeId: DEMO_GUIDES_NODE_ID,
      title: 'Welcome to Foliole'
    });
    expect(welcome?.content).toContain('# Welcome to Foliole');
    expect(welcome?.content).toContain('Start by clicking Read');
    expect(welcome?.content.match(/Start by clicking Read/g)).toHaveLength(1);
    expect(snapshot.nodesById[childNodeIds[0]!]).toMatchObject({
      parentNodeId: topicNodeId,
      title: 'Reading: Break the Whole into Pieces'
    });
    expect(snapshot.nodesById[topicNodeId]).toMatchObject({
      bodyStatus: 'ready',
      hasContent: true,
      parentNodeId: DEMO_GUIDES_NODE_ID,
      reading: expect.objectContaining({ state: 'active' }),
      title: topic.title
    });
});

it('selects the Demo topic that matches the current canonical path', () => {
    const selectedTopic = requireTopic(0);
    const snapshot = createDemoWorkspaceSnapshot(canonicalGuidePath(selectedTopic.slug), new Date('2026-06-17T00:00:00.000Z'));

    expect(resolveDemoTopicFromPath(canonicalGuidePath(selectedTopic.slug))).toBe(selectedTopic);
    expect(snapshot.activeNodeId).toBe(getDemoTopicNodeId(selectedTopic));
    expect(snapshot.reviewSession.currentNodeId).toBe(getDemoTopicNodeId(selectedTopic));
});

it('uses generated zh-hans Guides content for zh-hans routes', () => {
    const topic = requireTopic(0);
    const snapshot = createDemoWorkspaceSnapshot(canonicalGuidePath(topic.slug, 'zh-hans'), new Date('2026-06-17T00:00:00.000Z'));
    const welcomeNodeId = getDemoTopicNodeId(topic);

    expect(snapshot.activeNodeId).toBe(getDemoTopicNodeId(topic));
    expect(snapshot.nodesById[welcomeNodeId]?.title).toBe('欢迎使用 Foliole');
    expect(snapshot.nodesById[welcomeNodeId]?.content).toContain('请先点击底部动作条里的 Read');
    expect(snapshot.nodesById[welcomeNodeId]?.content).toContain('# 欢迎使用 Foliole');
    expect(snapshot.nodesById[welcomeNodeId]?.content.match(/请先点击底部动作条里的 Read/g)).toHaveLength(1);
});

it('falls back to the first Demo topic for unknown paths', () => {
    expect(resolveDemoTopicFromPath('/demo/missing/')).toBe(DEFAULT_DEMO_TOPIC);
});

it('does not route legacy Demo slug URLs to public guide topics', () => {
    const selectedTopic = requireTopic(0);

    expect(resolveDemoTopicFromPath(`/en/demo/${selectedTopic.slug}/`)).toBe(DEFAULT_DEMO_TOPIC);
});

function stubDemoStorage(storage: Map<string, string>, pathname = canonicalGuidePath(requireTopic(0).slug)) {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-06-17T00:00:00.000Z')));
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value)
    },
    location: { pathname }
  });
}

function simulateDemoRefresh(storage: Map<string, string>) {
  vi.unstubAllGlobals();
  stubDemoStorage(storage);
}

it('installs the Demo snapshot into the same storage key consumed by the desktop renderer', async () => {
    const storage = new Map<string, string>();
    stubDemoStorage(storage);

    await installDemoWorkspaceSnapshot();

    const payload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
    expect(payload.state.activeNodeId).toBe(getDemoTopicNodeId(requireTopic(0)));
    expect(payload.state.nodesById[INBOX_NODE_ID]).toMatchObject({ specialKind: 'inbox' });
    vi.unstubAllGlobals();
});

it('keeps a compatible Demo workspace payload during refresh', async () => {
    const storage = new Map<string, string>();
    stubDemoStorage(storage);
    await installDemoWorkspaceSnapshot();
    const payload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
    const nextTopic = requireTopic(0);
    payload.state.activeNodeId = getDemoTopicNodeId(requireTopic(0));
    payload.state.reviewSession.currentNodeId = getDemoTopicNodeId(requireTopic(0));
    storage.set(WORKSPACE_STORAGE_KEY, JSON.stringify(payload));
    simulateDemoRefresh(storage);
    stubDemoStorage(storage, canonicalGuidePath(requireTopic(0).slug));

    await installDemoWorkspaceSnapshot();

    const nextPayload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
    expect(nextPayload.state.activeNodeId).toBe(getDemoTopicNodeId(nextTopic));
    expect(nextPayload.state.reviewSession.currentNodeId).toBe(getDemoTopicNodeId(nextTopic));
    expect(nextPayload.state.nodesById[getDemoTopicNodeId(nextTopic)]).toMatchObject({ title: 'Welcome to Foliole' });
    vi.unstubAllGlobals();
});

it('persists Demo browser-local review actions into the workspace payload', async () => {
    const storage = new Map<string, string>();
    const now = '2026-06-17T00:10:00.000Z';
    stubDemoStorage(storage);
    await installDemoWorkspaceSnapshot();
    const activeNodeId = useWorkspaceStore.getState().activeNodeId!;

    await expect(useWorkspaceStore.getState().readReviewTopic(now)).resolves.toBe(true);

    const payload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
    expect(payload.state.reviewSession).toMatchObject({
      completedAt: now,
      currentNodeId: null,
      queueNodeIds: []
    });
    expect(payload.state.nodesById[activeNodeId].reading).toMatchObject({
      lastHandledAt: now,
      state: 'active'
    });
    simulateDemoRefresh(storage);
    await installDemoWorkspaceSnapshot();
    expect(useWorkspaceStore.getState().nodesById[activeNodeId]?.reading).toMatchObject({
      lastHandledAt: now,
      state: 'active'
    });
    vi.unstubAllGlobals();
});

it('repairs browser-local Demo nodes stuck in fetching state during refresh', async () => {
    const storage = new Map<string, string>();
    stubDemoStorage(storage);
    await installDemoWorkspaceSnapshot();
    const payload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
    const activeNodeId = payload.state.activeNodeId;
    payload.state.nodesById[activeNodeId] = {
      ...payload.state.nodesById[activeNodeId],
      bodyStatus: 'fetching',
      content: 'Recovered browser-local content',
      hasContent: false
    };
    storage.set(WORKSPACE_STORAGE_KEY, JSON.stringify(payload));
    simulateDemoRefresh(storage);

    await installDemoWorkspaceSnapshot();

    const nextPayload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
    expect(nextPayload.state.nodesById[activeNodeId]).toMatchObject({
      bodyStatus: 'ready',
      content: 'Recovered browser-local content',
      hasContent: true
    });
    vi.unstubAllGlobals();
});

it('reinstalls the official Demo snapshot when the stored payload is incompatible', async () => {
    const storage = new Map<string, string>();
    stubDemoStorage(storage);
    storage.set(WORKSPACE_STORAGE_KEY, JSON.stringify({
      state: { capturedWorkspaceVersion: 'old-demo', nodesById: {}, nodeOrder: [], reviewSession: { currentNodeId: null } },
      version: 0
    }));
    storage.set('demo-workspace-v1', 'demo:2026-06-17');
    simulateDemoRefresh(storage);

    await installDemoWorkspaceSnapshot();

    const payload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
    expect(payload.state.activeNodeId).toBe(getDemoTopicNodeId(requireTopic(0)));
    expect(payload.state.nodesById[INBOX_NODE_ID]).toMatchObject({ specialKind: 'inbox' });
    vi.unstubAllGlobals();
});

it('persists the Demo preview day as Demo-owned browser-local state', () => {
    const storage = new Map<string, string>();
    stubDemoStorage(storage);

    expect(readDemoPreviewDay()).toBe(0);
    writeDemoPreviewDay(2);

    expect(readDemoPreviewDay()).toBe(2);
    expect(storage.get('foliole-demo-preview-day-v1')).toBe('2');
    vi.unstubAllGlobals();
});

it('clears only Demo-owned local storage keys', async () => {
    const storage = new Map<string, string>();
    stubDemoStorage(storage);
    await installDemoWorkspaceSnapshot();
    writeDemoPreviewDay(3);
    storage.set('foliole-demo-try-local-v1', 'draft');
    storage.set('site-theme', 'light');

    clearDemoLocalStorage();

    expect(storage.has(WORKSPACE_STORAGE_KEY)).toBe(false);
    expect(storage.has('demo-workspace-v1')).toBe(false);
    expect(storage.has('foliole-demo-preview-day-v1')).toBe(false);
    expect(storage.has('foliole-demo-try-local-v1')).toBe(false);
    expect(storage.get('site-theme')).toBe('light');
    vi.unstubAllGlobals();
});

it('fails visibly instead of reseeding when Demo local storage is unavailable', async () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new DOMException('Blocked', 'SecurityError');
        }
      },
      location: { pathname: canonicalGuidePath(requireTopic(0).slug) }
    });

    await expect(installDemoWorkspaceSnapshot()).rejects.toThrow('Blocked');
    vi.unstubAllGlobals();
});
