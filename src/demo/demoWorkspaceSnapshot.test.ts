import { expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { createInitialWorkspaceState, useWorkspaceStore, WORKSPACE_STORAGE_KEY } from '../store/workspaceStore';

import { canonicalDemoPath, DEFAULT_DEMO_TOPIC, DEMO_TOPICS } from './demoContent';
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

it('projects Demo topics into the Foliole workspace tree under Inbox', () => {
    const now = new Date('2026-06-17T00:00:00.000Z');
    const snapshot = createDemoWorkspaceSnapshot(canonicalDemoPath(requireTopic(0).slug), now);
    const firstTopic = requireTopic(0);
    const firstReviewItem = firstTopic.reviewItems[0];
    if (!firstReviewItem) throw new Error('Missing Demo review item fixture.');
    const firstReviewNodeId = `demo-${firstTopic.slug}-review-${firstReviewItem.id}`;

    expect(snapshot.nodeOrder).toContain(INBOX_NODE_ID);
    expect(snapshot.nodesById[INBOX_NODE_ID]).toMatchObject({ specialKind: 'inbox', title: 'Inbox' });
    expect(snapshot.activeNodeId).toBe(`demo-${DEFAULT_DEMO_TOPIC?.slug}`);
    expect(snapshot.reviewSession.queueNodeIds).toHaveLength(DEMO_TOPICS.length);
    expect(snapshot.reviewSession.queueNodeIds).not.toContain(firstReviewNodeId);
    for (const topic of DEMO_TOPICS) {
      expect(snapshot.nodesById[`demo-${topic.slug}`]).toMatchObject({
        bodyStatus: 'ready',
        hasContent: true,
        kind: 'topic',
        parentNodeId: INBOX_NODE_ID,
        title: topic.title
      });
    }
    expect(snapshot.nodesById[firstReviewNodeId]).toMatchObject({
      bodyStatus: 'ready',
      content: firstReviewItem.prompt,
      kind: 'item',
      parentNodeId: `demo-${firstTopic.slug}`,
      reveal: firstReviewItem.answer,
      review: expect.objectContaining({
        due: '2026-06-18T00:00:00.000Z',
        lastReviewAt: null,
        reps: 0
      })
    });
});

it('projects relative reading seeds from the runtime day zero anchor', () => {
    const snapshot = createDemoWorkspaceSnapshot(canonicalDemoPath(requireTopic(0).slug), new Date('2026-06-17T00:00:00.000Z'));
    const first = snapshot.nodesById[`demo-${requireTopic(0).slug}`];
    const second = snapshot.nodesById[`demo-${requireTopic(1).slug}`];

    expect(first?.reading?.nextAt).toBe('2026-06-17T00:00:00.000Z');
    expect(second?.reading?.nextAt).toBe('2026-06-18T00:00:00.000Z');
    expect(second?.reading?.nextAt).not.toBe(second?.reading?.lastHandledAt);
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
    payload.state.activeNodeId = `demo-${requireTopic(1).slug}`;
    payload.state.reviewSession.currentNodeId = `demo-${requireTopic(1).slug}`;
    payload.state.reviewSession.queueNodeIds = [
      `demo-${requireTopic(1).slug}`,
      ...payload.state.reviewSession.queueNodeIds.filter((nodeId: string) => nodeId !== `demo-${requireTopic(1).slug}`)
    ];
    storage.set(WORKSPACE_STORAGE_KEY, JSON.stringify(payload));
    simulateDemoRefresh(storage);
    stubDemoStorage(storage, canonicalDemoPath(requireTopic(1).slug));

    await installDemoWorkspaceSnapshot();

    const nextPayload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
    expect(nextPayload.state.activeNodeId).toBe(`demo-${requireTopic(1).slug}`);
    expect(nextPayload.state.reviewSession.currentNodeId).toBe(`demo-${requireTopic(1).slug}`);
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
