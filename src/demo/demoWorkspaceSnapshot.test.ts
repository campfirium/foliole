import { expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { createInitialWorkspaceState, useWorkspaceStore, WORKSPACE_STORAGE_KEY } from '../store/workspaceStore';

import { canonicalDemoPath, DEFAULT_DEMO_TOPIC, DEMO_TOPICS } from './demoContent';
import {
  DEMO_GUIDES_NODE_ID,
  DEMO_GUIDES_TITLE,
  DEMO_GUIDES_WELCOME_NODE_ID_BY_LOCALE
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
    const snapshot = createDemoWorkspaceSnapshot(canonicalDemoPath(topic.slug), now);
    const welcomeNodeId = DEMO_GUIDES_WELCOME_NODE_ID_BY_LOCALE['en-US'];
    const topicNodeId = `demo-${topic.slug}`;
    const welcome = snapshot.nodesById[welcomeNodeId];

    expect(snapshot.nodeOrder).toContain(INBOX_NODE_ID);
    expect(snapshot.nodesById[INBOX_NODE_ID]).toMatchObject({ specialKind: 'inbox', title: 'Inbox' });
    expect(snapshot.nodesById[DEMO_GUIDES_NODE_ID]).toMatchObject({
      kind: 'folder',
      manualChildOrder: [...DEMO_TOPICS.map((demoTopic) => `demo-${demoTopic.slug}`), welcomeNodeId],
      title: DEMO_GUIDES_TITLE
    });
    expect(snapshot.activeNodeId).toBe(topicNodeId);
    expect(snapshot.reviewSession.currentNodeId).toBe(topicNodeId);
    expect(snapshot.reviewSession.queueNodeIds).toEqual([topicNodeId]);
    expect(welcome).toMatchObject({
      bodyStatus: 'ready',
      content: expect.stringContaining('# Welcome to Foliole'),
      kind: 'topic',
      manualChildOrder: expect.arrayContaining([`${welcomeNodeId}-child-1`]),
      parentNodeId: DEMO_GUIDES_NODE_ID,
      title: 'Welcome to Foliole'
    });
    expect(snapshot.nodesById[`${welcomeNodeId}-child-1`]).toMatchObject({
      parentNodeId: welcomeNodeId,
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
    const selectedTopic = requireTopic(1);
    const snapshot = createDemoWorkspaceSnapshot(canonicalDemoPath(selectedTopic.slug), new Date('2026-06-17T00:00:00.000Z'));

    expect(resolveDemoTopicFromPath(canonicalDemoPath(selectedTopic.slug))).toBe(selectedTopic);
    expect(snapshot.activeNodeId).toBe(`demo-${selectedTopic.slug}`);
    expect(snapshot.reviewSession.currentNodeId).toBe(`demo-${selectedTopic.slug}`);
});

it('keeps localized Welcome guide content while routing canonical topic URLs to Demo topics', () => {
    const topic = requireTopic(0);
    const snapshot = createDemoWorkspaceSnapshot(canonicalDemoPath(topic.slug, 'zh-hans'), new Date('2026-06-17T00:00:00.000Z'));
    const welcomeNodeId = DEMO_GUIDES_WELCOME_NODE_ID_BY_LOCALE['zh-CN'];

    expect(snapshot.activeNodeId).toBe(`demo-${topic.slug}`);
    expect(snapshot.nodesById[welcomeNodeId]?.title).toBe('欢迎使用 Foliole');
    expect(snapshot.nodesById[`${welcomeNodeId}-child-1`]?.title).toBe('阅读：化整为零');
});

it('falls back to the first Demo topic for unknown paths', () => {
    expect(resolveDemoTopicFromPath('/demo/missing/')).toBe(DEFAULT_DEMO_TOPIC);
});

function stubDemoStorage(storage: Map<string, string>, pathname = canonicalDemoPath(requireTopic(0).slug)) {
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
    expect(payload.state.activeNodeId).toBe(`demo-${requireTopic(0).slug}`);
    expect(payload.state.nodesById[INBOX_NODE_ID]).toMatchObject({ specialKind: 'inbox' });
    vi.unstubAllGlobals();
});

it('keeps a compatible Demo workspace payload during refresh', async () => {
    const storage = new Map<string, string>();
    stubDemoStorage(storage);
    await installDemoWorkspaceSnapshot();
    const payload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
    const nextTopic = requireTopic(1);
    const welcomeNodeId = DEMO_GUIDES_WELCOME_NODE_ID_BY_LOCALE['en-US'];
    payload.state.activeNodeId = `demo-${requireTopic(0).slug}`;
    payload.state.reviewSession.currentNodeId = `demo-${requireTopic(0).slug}`;
    storage.set(WORKSPACE_STORAGE_KEY, JSON.stringify(payload));
    simulateDemoRefresh(storage);
    stubDemoStorage(storage, canonicalDemoPath(requireTopic(1).slug));

    await installDemoWorkspaceSnapshot();

    const nextPayload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
    expect(nextPayload.state.activeNodeId).toBe(`demo-${nextTopic.slug}`);
    expect(nextPayload.state.reviewSession.currentNodeId).toBe(`demo-${nextTopic.slug}`);
    expect(nextPayload.state.nodesById[`${welcomeNodeId}-child-1`]).toMatchObject({
      title: 'Reading: Break the Whole into Pieces'
    });
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
    expect(payload.state.activeNodeId).toBe(`demo-${requireTopic(0).slug}`);
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
      location: { pathname: canonicalDemoPath(requireTopic(0).slug) }
    });

    await expect(installDemoWorkspaceSnapshot()).rejects.toThrow('Blocked');
    vi.unstubAllGlobals();
});
