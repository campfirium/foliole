import { expect, it, vi } from 'vitest';

import { createInitialWorkspaceState, WORKSPACE_STORAGE_KEY, useWorkspaceStore } from '../store/workspaceStore';

import { canonicalGuidePath, DEMO_TOPICS, getDemoTopicNodeId } from './demoContent';
import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION } from './demoLocalStorage';
import { createDemoWorkspaceSnapshot, installDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

function requireTopic(slug: string) {
  const topic = DEMO_TOPICS.find((candidate) => candidate.slug === slug);
  if (!topic) throw new Error(`Missing Demo topic fixture: ${slug}`);
  return topic;
}

function stubDemoStorage(storage: Map<string, string>, pathname: string) {
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

it('renders short Guide lines as soft line breaks instead of separate spaced paragraphs', () => {
  const topic = requireTopic('welcome-to-foliole.repeat-internalize-knowledge');
  const snapshot = createDemoWorkspaceSnapshot(canonicalGuidePath(topic.slug), new Date('2026-06-17T00:00:00.000Z'));
  const content = snapshot.nodesById[getDemoTopicNodeId(topic)]?.content;

  expect(content).toContain('Spaced repetition internalizes knowledge step by step.\nIncremental reading makes reading actually complete.\nFoliole makes incremental reading smooth.');
  expect(content).not.toContain('Spaced repetition internalizes knowledge step by step.\n\nIncremental reading makes reading actually complete.');
});

it('reinstalls the official Demo snapshot when the stored payload belongs to another locale', async () => {
  const storage = new Map<string, string>();
  const topic = requireTopic('welcome-to-foliole');
  const zhSnapshot = createDemoWorkspaceSnapshot(canonicalGuidePath(topic.slug, 'zh-hans'), new Date('2026-06-17T00:00:00.000Z'));
  storage.set(WORKSPACE_STORAGE_KEY, JSON.stringify({ state: zhSnapshot, version: 0 }));
  storage.set(DEMO_SNAPSHOT_VERSION, DEMO_CAPTURED_VERSION);
  stubDemoStorage(storage, canonicalGuidePath(topic.slug, 'en'));

  await installDemoWorkspaceSnapshot();

  const payload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
  const node = payload.state.nodesById[getDemoTopicNodeId(topic)];
  expect(node.title).toBe('Welcome to Foliole');
  expect(node.content).toContain('# Welcome to Foliole');
  expect(node.content).toContain('Start by clicking Read');
  expect(node.content).not.toContain('欢迎使用 Foliole');
  vi.unstubAllGlobals();
});
