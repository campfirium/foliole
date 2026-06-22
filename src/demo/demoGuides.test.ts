import { expect, it, vi } from 'vitest';

import { HOME_NODE_ID, INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { WORKSPACE_STORAGE_KEY } from '../store/workspaceStore';

import { DEMO_TOPICS } from './demoContent';
import {
  DEMO_GUIDES_NODE_ID,
  DEMO_GUIDES_TITLE,
  DEMO_GUIDES_WELCOME_NODE_ID_BY_LOCALE
} from './demoGuides';
import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION } from './demoLocalStorage';
import { createDemoWorkspaceSnapshot, installDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

const NOW = new Date('2026-06-17T00:00:00.000Z');

it('places the guided sample tree under Guides while keeping Inbox empty for official content', () => {
  const snapshot = createDemoWorkspaceSnapshot('/demo/', NOW);
  const welcomeNodeId = DEMO_GUIDES_WELCOME_NODE_ID_BY_LOCALE['en-US'];
  const guides = snapshot.nodesById[DEMO_GUIDES_NODE_ID];
  const inbox = snapshot.nodesById[INBOX_NODE_ID];
  const welcome = snapshot.nodesById[welcomeNodeId];

  expect(snapshot.nodeOrder.slice(0, 3)).toEqual([HOME_NODE_ID, DEMO_GUIDES_NODE_ID, INBOX_NODE_ID]);
  expect(guides).toMatchObject({
    kind: 'folder',
    parentNodeId: null,
    title: DEMO_GUIDES_TITLE,
    manualChildOrder: [...DEMO_TOPICS.map((topic) => `demo-${topic.slug}`), welcomeNodeId]
  });
  expect(welcome).toMatchObject({
    content: expect.stringContaining('# Welcome to Foliole'),
    kind: 'topic',
    parentNodeId: DEMO_GUIDES_NODE_ID,
    title: 'Welcome to Foliole'
  });
  expect(welcome?.manualChildOrder).toHaveLength(7);
  expect(snapshot.nodesById[welcome?.manualChildOrder?.[0] ?? '']).toMatchObject({
    parentNodeId: welcomeNodeId,
    title: 'Reading: Break the Whole into Pieces'
  });
  expect(Object.values(snapshot.nodesById).map((node) => node.title)).toContain('Focused reading and review');
  expect(inbox?.manualChildOrder ?? []).toEqual([]);
});

it('uses the Chinese guided sample welcome topic for zh-hans Demo routes', () => {
  const snapshot = createDemoWorkspaceSnapshot('/zh-hans/demo/focused-reading-review/', NOW);
  const welcomeNodeId = DEMO_GUIDES_WELCOME_NODE_ID_BY_LOCALE['zh-CN'];

  expect(snapshot.nodesById[DEMO_GUIDES_NODE_ID]?.manualChildOrder?.at(-1)).toBe(welcomeNodeId);
  expect(snapshot.nodesById[welcomeNodeId]).toMatchObject({
    content: expect.stringContaining('# 欢迎使用 Foliole'),
    title: '欢迎使用 Foliole'
  });
  expect(snapshot.nodesById[`${welcomeNodeId}-child-1`]?.title).toBe('阅读：化整为零');
});

it('reinstalls the official Demo snapshot when a stored payload is missing Guides', async () => {
  const storage = new Map<string, string>();
  const snapshot = createDemoWorkspaceSnapshot('/demo/', NOW);
  delete snapshot.nodesById[DEMO_GUIDES_NODE_ID];
  delete snapshot.nodesById[DEMO_GUIDES_WELCOME_NODE_ID_BY_LOCALE['en-US']];
  snapshot.nodeOrder = snapshot.nodeOrder.filter((nodeId) => nodeId !== DEMO_GUIDES_NODE_ID);
  storage.set(WORKSPACE_STORAGE_KEY, JSON.stringify({ state: snapshot, version: 0 }));
  storage.set(DEMO_SNAPSHOT_VERSION, DEMO_CAPTURED_VERSION);
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    },
    location: { pathname: '/demo/' }
  });

  await installDemoWorkspaceSnapshot();

  const payload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
  expect(payload.state.nodesById[DEMO_GUIDES_NODE_ID]).toMatchObject({ title: DEMO_GUIDES_TITLE });
  expect(payload.state.nodesById[DEMO_GUIDES_WELCOME_NODE_ID_BY_LOCALE['en-US']]).toMatchObject({
    title: 'Welcome to Foliole'
  });
  vi.unstubAllGlobals();
});
