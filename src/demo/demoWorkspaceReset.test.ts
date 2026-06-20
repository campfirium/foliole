import { expect, it, vi } from 'vitest';

import { createInitialWorkspaceState, useWorkspaceStore, WORKSPACE_STORAGE_KEY } from '../store/workspaceStore';

import { canonicalDemoPath, DEMO_TOPICS } from './demoContent';
import { DEMO_GUIDES_NODE_ID } from './demoGuides';
import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION, readDemoPreviewDay, writeDemoPreviewDay } from './demoLocalStorage';
import { createBrowserDemoRuntimeController } from './demoRuntimeController';
import { resetDemoWorkspaceSnapshot } from './demoWorkspaceReset';

function stubDemoStorage(storage: Map<string, string>, pathname: string) {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      }
    },
    location: { pathname }
  });
}

it('forces the current Demo store back to the official snapshot', () => {
  const topic = DEMO_TOPICS[1];
  if (!topic) throw new Error('Demo reset test requires a second topic.');
  const pathname = canonicalDemoPath(topic.slug);
  const storage = new Map<string, string>();
  stubDemoStorage(storage, pathname);
  useWorkspaceStore.setState({
    ...createInitialWorkspaceState(new Date('2026-06-19T00:00:00.000Z')),
    activeNodeId: 'imported-local-topic',
    nodeOrder: ['imported-local-topic'],
    nodesById: {}
  });

  resetDemoWorkspaceSnapshot(pathname);

  const state = useWorkspaceStore.getState();
  const payload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
  expect(state.activeNodeId).toBe(`demo-${topic.slug}`);
  expect(state.nodesById[`demo-${topic.slug}`]).toMatchObject({
    bodyStatus: 'ready',
    hasContent: true,
    parentNodeId: DEMO_GUIDES_NODE_ID,
    title: topic.title
  });
  expect(state.nodesById[DEMO_GUIDES_NODE_ID]).toMatchObject({ kind: 'folder', title: 'Guides' });
  expect(payload.state.activeNodeId).toBe(`demo-${topic.slug}`);
  expect(storage.get(DEMO_SNAPSHOT_VERSION)).toBe(DEMO_CAPTURED_VERSION);
  vi.unstubAllGlobals();
});

it('clears browser-local Demo state and immediately reinstalls the official snapshot', async () => {
  const topic = DEMO_TOPICS[0];
  if (!topic) throw new Error('Demo reset test requires a topic.');
  const pathname = canonicalDemoPath(topic.slug);
  const storage = new Map<string, string>();
  stubDemoStorage(storage, pathname);
  writeDemoPreviewDay(4);
  useWorkspaceStore.setState({
    ...createInitialWorkspaceState(new Date('2026-06-19T00:00:00.000Z')),
    activeNodeId: 'imported-local-topic',
    nodeOrder: ['imported-local-topic'],
    nodesById: {}
  });

  const cleared = await createBrowserDemoRuntimeController().clearLocalData();

  expect(cleared).toBe(true);
  expect(readDemoPreviewDay()).toBe(0);
  expect(useWorkspaceStore.getState().activeNodeId).toBe(`demo-${topic.slug}`);
  expect(storage.get(DEMO_SNAPSHOT_VERSION)).toBe(DEMO_CAPTURED_VERSION);
  vi.unstubAllGlobals();
});
