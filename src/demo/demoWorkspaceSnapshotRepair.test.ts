import { expect, it } from 'vitest';

import { createDemoWorkspaceSnapshot } from './demoWorkspaceSnapshot';
import { repairDemoWorkspacePayload } from './demoWorkspaceSnapshotRepair';

it('repairs stale inline document flags that would keep Demo content loading', () => {
  const snapshot = createDemoWorkspaceSnapshot('/en/demo/');
  const activeNodeId = snapshot.activeNodeId!;
  snapshot.nodesById[activeNodeId] = {
    ...snapshot.nodesById[activeNodeId]!,
    bodyStatus: 'ready',
    content: '',
    hasReveal: true,
    reveal: null
  };

  const repaired = repairDemoWorkspacePayload(JSON.stringify({ state: snapshot, version: 0 }), '/en/demo/');
  const payload = JSON.parse(repaired ?? 'null');

  expect(payload.state.nodesById[activeNodeId]).toMatchObject({
    bodyStatus: 'empty',
    hasContent: false,
    hasReveal: false,
    reveal: null
  });
});

it('repairs legacy nodes that are missing inline document fields', () => {
  const snapshot = createDemoWorkspaceSnapshot('/en/demo/');
  const activeNodeId = snapshot.activeNodeId!;
  snapshot.nodesById[activeNodeId] = {
    ...snapshot.nodesById[activeNodeId]!,
    bodyStatus: 'fetching',
    hasContent: true,
    hasReveal: true
  };
  delete (snapshot.nodesById[activeNodeId] as Partial<typeof snapshot.nodesById[string]>).content;
  delete (snapshot.nodesById[activeNodeId] as Partial<typeof snapshot.nodesById[string]>).reveal;

  const repaired = repairDemoWorkspacePayload(JSON.stringify({ state: snapshot, version: 0 }), '/en/demo/');
  const payload = JSON.parse(repaired ?? 'null');

  expect(payload.state.nodesById[activeNodeId]).toMatchObject({
    bodyStatus: 'empty',
    content: '',
    hasContent: false,
    hasReveal: false,
    reveal: null
  });
});
