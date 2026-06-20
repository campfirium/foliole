import { expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { WORKSPACE_STORAGE_KEY } from '../store/workspaceStore';

import { DEMO_TOPICS } from './demoContent';
import { DEMO_GUIDES_NODE_ID, DEMO_GUIDES_TITLE } from './demoGuides';
import { DEMO_CAPTURED_VERSION, DEMO_SNAPSHOT_VERSION } from './demoLocalStorage';
import { createDemoWorkspaceSnapshot, installDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';

const NOW = new Date('2026-06-17T00:00:00.000Z');

it('places official Demo topics under Guides while keeping Inbox empty for official content', () => {
  const snapshot = createDemoWorkspaceSnapshot('/demo/', NOW);
  const demoTopicIds = DEMO_TOPICS.map((topic) => `demo-${topic.slug}`);
  const guides = snapshot.nodesById[DEMO_GUIDES_NODE_ID];
  const inbox = snapshot.nodesById[INBOX_NODE_ID];

  expect(guides).toMatchObject({
    kind: 'folder',
    parentNodeId: null,
    title: DEMO_GUIDES_TITLE,
    manualChildOrder: demoTopicIds
  });
  expect(inbox?.manualChildOrder ?? []).not.toEqual(expect.arrayContaining(demoTopicIds));
  for (const topicId of demoTopicIds) {
    expect(snapshot.nodesById[topicId]?.parentNodeId).toBe(DEMO_GUIDES_NODE_ID);
  }
});

it('reinstalls the official Demo snapshot when a stored payload is missing Guides', async () => {
  const storage = new Map<string, string>();
  const snapshot = createDemoWorkspaceSnapshot('/demo/', NOW);
  delete snapshot.nodesById[DEMO_GUIDES_NODE_ID];
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
  vi.unstubAllGlobals();
});
