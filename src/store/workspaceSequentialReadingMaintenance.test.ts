import { expect, it } from 'vitest';

import { buildSequentialReadingMaintenancePatch } from './workspaceSequentialReadingMaintenance';
import { maintenanceNode, maintenanceTree } from './workspaceSequentialReadingMaintenance.testSupport';

it('unlocks a moved subtree once and preserves scheduling data and both input snapshots', () => {
  const args = maintenanceTree();
  args.changedRootNodeIds.push('reading-0', 'moved');
  const before = structuredClone(args);
  const patch = buildSequentialReadingMaintenancePatch(args)!;

  expect(patch.changes).toHaveLength(100);
  for (const change of patch.changes) {
    const original = args.nodesById[change.nodeId]!;
    expect(change.beforeReading).toEqual(original.reading);
    expect(change.afterReading).toEqual({ ...original.reading, state: 'active' });
    expect(patch.nodesById[change.nodeId]).toEqual({ ...original, reading: change.afterReading });
    expect(patch.nodesById[change.nodeId]).not.toBe(original);
  }
  expect(args).toEqual(before);
  expect(patch.nodesById.destination).toBe(args.nodesById.destination);
});

it('keeps nested enabled sources locked and leaves completed entries unchanged', () => {
  const args = maintenanceTree(3);
  args.nodesById.nested = { ...maintenanceNode('nested', 'moved'), sequentialReadingEnabled: true };
  args.nodesById['reading-0'] = { ...args.nodesById['reading-0']!, parentNodeId: 'nested' };
  args.nodesById['reading-1'] = maintenanceNode('reading-1', 'moved', 'done');
  args.nodeOrder.push('nested');
  const patch = buildSequentialReadingMaintenancePatch(args)!;

  expect(patch.changes.map((change) => change.nodeId)).toEqual(['reading-2']);
  expect(patch.nodesById['reading-0']).toBe(args.nodesById['reading-0']);
  expect(patch.nodesById['reading-1']).toBe(args.nodesById['reading-1']);
});

it('returns no patch when moved entries already have active reading state', () => {
  const args = maintenanceTree(3);
  for (const id of ['reading-0', 'reading-1', 'reading-2']) {
    args.nodesById[id] = maintenanceNode(id, 'moved', 'active');
  }
  expect(buildSequentialReadingMaintenancePatch(args)).toBeNull();
});
