import { expect, it, vi } from 'vitest';

import { HOME_NODE_ID, INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { WORKSPACE_STORAGE_KEY } from '../store/workspaceStore';

import { DEFAULT_DEMO_TOPIC, DEMO_TOPICS, getDemoTopicNodeId } from './demoContent';
import {
  DEMO_GUIDES_NODE_ID,
  DEMO_GUIDES_TITLE
} from './demoGuides';
import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION } from './demoLocalStorage';
import { createDemoWorkspaceSnapshot, installDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

const NOW = new Date('2026-06-17T00:00:00.000Z');

it('places the generated Guides content under Guides while keeping Inbox empty for official content', () => {
  const snapshot = createDemoWorkspaceSnapshot('/en/demo/', NOW);
  const guides = snapshot.nodesById[DEMO_GUIDES_NODE_ID];
  const inbox = snapshot.nodesById[INBOX_NODE_ID];
  const welcomeNodeId = getDemoTopicNodeId(DEFAULT_DEMO_TOPIC);
  const childNodeIds = DEMO_TOPICS.slice(1).map(getDemoTopicNodeId);
  const welcome = snapshot.nodesById[welcomeNodeId];

  expect(snapshot.nodeOrder.slice(0, 3)).toEqual([HOME_NODE_ID, DEMO_GUIDES_NODE_ID, INBOX_NODE_ID]);
  expect(guides).toMatchObject({
    kind: 'folder',
    parentNodeId: null,
    title: DEMO_GUIDES_TITLE,
    manualChildOrder: [welcomeNodeId]
  });
  expect(welcome).toMatchObject({
    kind: 'topic',
    parentNodeId: DEMO_GUIDES_NODE_ID,
    title: 'Welcome to Foliole'
  });
  expect(welcome?.content).toContain('# Welcome to Foliole');
  expect(welcome?.content).toContain('Start by clicking Read');
  expect(welcome?.content.match(/Start by clicking Read/g)).toHaveLength(1);
  expect(welcome?.manualChildOrder).toEqual(childNodeIds);
  expect(snapshot.nodesById[childNodeIds[0]!]).toMatchObject({
    parentNodeId: welcomeNodeId,
    title: 'Reading: Break the Whole into Pieces'
  });
  expect(inbox?.manualChildOrder ?? []).toEqual([]);
});

it('uses generated zh-hans Guides content for zh-hans routes', () => {
  const snapshot = createDemoWorkspaceSnapshot('/zh-hans/guides/welcome-to-foliole/', NOW);
  const welcomeNodeId = getDemoTopicNodeId(DEFAULT_DEMO_TOPIC);

  expect(snapshot.nodesById[DEMO_GUIDES_NODE_ID]?.manualChildOrder).toEqual([welcomeNodeId]);
  expect(snapshot.nodesById[welcomeNodeId]?.content).toContain('请先点击底部动作条里的 Read');
  expect(snapshot.nodesById[welcomeNodeId]?.content).toContain('# 欢迎使用 Foliole');
  expect(snapshot.nodesById[welcomeNodeId]?.content.match(/请先点击底部动作条里的 Read/g)).toHaveLength(1);
  expect(snapshot.nodesById[welcomeNodeId]?.title).toBe('欢迎使用 Foliole');
});

it('reinstalls the official Demo snapshot when a stored payload is missing Guides', async () => {
  const storage = new Map<string, string>();
  const snapshot = createDemoWorkspaceSnapshot('/en/demo/', NOW);
  delete snapshot.nodesById[DEMO_GUIDES_NODE_ID];
  snapshot.nodeOrder = snapshot.nodeOrder.filter((nodeId) => nodeId !== DEMO_GUIDES_NODE_ID);
  storage.set(WORKSPACE_STORAGE_KEY, JSON.stringify({ state: snapshot, version: 0 }));
  storage.set(DEMO_SNAPSHOT_VERSION, DEMO_CAPTURED_VERSION);
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    },
    location: { pathname: '/en/demo/' }
  });

  await installDemoWorkspaceSnapshot();

  const payload = JSON.parse(storage.get(WORKSPACE_STORAGE_KEY) ?? 'null');
  expect(payload.state.nodesById[DEMO_GUIDES_NODE_ID]).toMatchObject({ title: DEMO_GUIDES_TITLE });
  expect(payload.state.nodesById[getDemoTopicNodeId(DEFAULT_DEMO_TOPIC)]).toMatchObject({ title: 'Welcome to Foliole' });
  vi.unstubAllGlobals();
});
