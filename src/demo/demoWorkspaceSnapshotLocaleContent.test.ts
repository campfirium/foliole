import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { installBrowserDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowBrowserRuntime';
import { installWorkspaceBrowserCommit } from '../store/workspaceBrowserCommit';
import { createInitialWorkspaceState, WORKSPACE_STORAGE_KEY, useWorkspaceStore } from '../store/workspaceStore';

import { canonicalGuidePath, DEMO_TOPICS, getDemoTopicNodeId } from './demoContent';
import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION } from './demoLocalStorage';
import { createDemoWorkspaceSnapshot, installDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

beforeEach(() => {
  installWorkspaceBrowserCommit(null);
  installBrowserDailyFlowRuntime(null);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-17T00:00:00.000Z'));
});
afterEach(() => { installWorkspaceBrowserCommit(null); installBrowserDailyFlowRuntime(null); vi.useRealTimers(); vi.unstubAllGlobals(); });

function requireTopic(slug: string) {
  const topic = DEMO_TOPICS.find((candidate) => candidate.slug === slug);
  if (!topic) throw new Error(`Missing Demo topic fixture: ${slug}`);
  return topic;
}

function stubDemoStorage(storage: Map<string, string>, pathname: string) {
  installWorkspaceBrowserCommit({ save() {} });
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-06-17T00:00:00.000Z')));
  installWorkspaceBrowserCommit(null);
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

it('renders short Guide lines as soft line breaks instead of separate spaced paragraphs', () => {
  const topic = requireTopic('welcome-to-foliole.repeat-internalize-knowledge');
  const snapshot = createDemoWorkspaceSnapshot(canonicalGuidePath(topic.slug), new Date('2026-06-17T00:00:00.000Z'));
  const content = snapshot.nodesById[getDemoTopicNodeId(topic)]?.content;

  expect(content).toContain('Spaced repetition internalizes knowledge step by step.\nIncremental reading makes reading actually complete.\nFoliole makes incremental reading smooth.');
  expect(content).not.toContain('Spaced repetition internalizes knowledge step by step.\n\nIncremental reading makes reading actually complete.');
});

it('preserves explicit Guide paragraph breaks for reading-mode navigation', () => {
  const topic = requireTopic('what-the-foliole-demo-is-for');
  const snapshot = createDemoWorkspaceSnapshot(canonicalGuidePath(topic.slug), new Date('2026-06-17T00:00:00.000Z'));
  const content = snapshot.nodesById[getDemoTopicNodeId(topic)]?.content;

  expect(content).toContain('Maybe you are a longtime SuperMemo user and want to see how Foliole is different.\n\nMaybe you use Obsidian');
  expect(content).toContain('To make Foliole easier to experience directly, we built this online demo.\n\nNo installation is required.');
});

it('preserves existing content and learning facts while upgrading a known envelope from another locale', async () => {
  const storage = new Map<string, string>();
  const topic = requireTopic('welcome-to-foliole');
  const zhSnapshot = createDemoWorkspaceSnapshot(canonicalGuidePath(topic.slug, 'zh-hans'), new Date('2026-06-17T00:00:00.000Z'));
  storage.set(WORKSPACE_STORAGE_KEY, JSON.stringify({ state: zhSnapshot, version: 0 }));
  storage.set(DEMO_SNAPSHOT_VERSION, DEMO_CAPTURED_VERSION);
  stubDemoStorage(storage, canonicalGuidePath(topic.slug, 'en'));

  await installDemoWorkspaceSnapshot();

  const payload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
  const node = payload.state.nodesById[getDemoTopicNodeId(topic)];
  expect(node.title).toBe(zhSnapshot.nodesById[getDemoTopicNodeId(topic)]!.title);
  expect(node.content).toBe(zhSnapshot.nodesById[getDemoTopicNodeId(topic)]!.content);
  expect(node.reading).toEqual(zhSnapshot.nodesById[getDemoTopicNodeId(topic)]!.reading);
  vi.unstubAllGlobals();
});

it('keeps stored content when a marker changes instead of replacing its workspace', async () => {
  const storage = new Map<string, string>();
  const topic = requireTopic('what-the-foliole-demo-is-for');
  const staleSnapshot = createDemoWorkspaceSnapshot(canonicalGuidePath(topic.slug), new Date('2026-06-17T00:00:00.000Z'));
  const topicNode = staleSnapshot.nodesById[getDemoTopicNodeId(topic)];
  if (!topicNode) throw new Error('Missing stale Demo topic node');
  topicNode.content = topicNode.content.replace(
    'Maybe you are a longtime SuperMemo user and want to see how Foliole is different.\n\nMaybe you use Obsidian',
    'Maybe you are a longtime SuperMemo user and want to see how Foliole is different.\nMaybe you use Obsidian'
  );
  storage.set(WORKSPACE_STORAGE_KEY, JSON.stringify({ state: staleSnapshot, version: 0 }));
  storage.set(DEMO_SNAPSHOT_VERSION, 'demo:2026-06-23-guides-zh-repeat-period');
  stubDemoStorage(storage, canonicalGuidePath(topic.slug, 'en'));

  await installDemoWorkspaceSnapshot();

  const payload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
  const node = payload.state.nodesById[getDemoTopicNodeId(topic)];
  expect(storage.get(DEMO_SNAPSHOT_VERSION)).toBe(DEMO_CAPTURED_VERSION);
  expect(node.content).toBe(topicNode.content);
  vi.unstubAllGlobals();
});
