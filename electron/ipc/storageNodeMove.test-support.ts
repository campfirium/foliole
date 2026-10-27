import { expect, it, vi } from 'vitest';

import { workspaceMoveReceipt } from '../../src/test/workspaceMoveReceipt.js';
import { moveNodes } from '../database/nodeMutations.js';
import { scheduleMirrorSync } from '../mirror/mirrorSyncScheduler.js';
import { requestDesktopHighValueSync } from '../sync/desktopMemberSyncCadence.js';

import { handleInvokeRequest } from './commands.js';

export function registerMoveCommandCoverage() {
  const moveArgs = {
    nodes: [{ nodeId: 'node-2', expectedParentNodeId: null, parentNodeId: 'node-1',
      updatedAt: '2026-03-06T00:00:02.000Z' }],
    parentOrders: [{ parentNodeId: null, expectedChildIds: ['node-1', 'node-2'], childIds: ['node-1'] },
      { parentNodeId: 'node-1', expectedChildIds: [], childIds: ['node-2'] }],
    maintainSequentialReading: true, defaultPriority: 5 as const
  };

  it('handles the local move contract and publishes its actual accepted scope', async () => {
    const receipt = workspaceMoveReceipt(moveArgs);
    vi.mocked(moveNodes).mockReturnValue(receipt);
    await expect(handleInvokeRequest({ command: 'move_nodes', args: moveArgs })).resolves.toEqual(receipt);
    expect(moveNodes).toHaveBeenCalledWith(moveArgs);
  });

  it('publishes no mirror or sync success when the move transaction rejects a conflict', async () => {
    vi.mocked(moveNodes).mockImplementationOnce(() => { throw new Error('move_structure_conflict'); });
    await expect(handleInvokeRequest({ command: 'move_nodes', args: moveArgs })).rejects.toThrow('move_structure_conflict');
    expect(scheduleMirrorSync).not.toHaveBeenCalled();
    expect(requestDesktopHighValueSync).not.toHaveBeenCalled();
  });

  it.each([
    { ...moveArgs, nodeOrder: [] },
    { ...moveArgs, parentOrders: [{ parentNodeId: null, childIds: [] }] },
    { ...moveArgs, nodes: [{ ...moveArgs.nodes[0], reading: null }] },
    { ...moveArgs, defaultPriority: 100 },
    { ...moveArgs, maintainSequentialReading: 'yes' }
  ])('rejects malformed move payloads before any mutation', async (args) => {
    await expect(handleInvokeRequest({ command: 'move_nodes', args })).rejects.toThrow('invalid argument');
    expect(moveNodes).not.toHaveBeenCalled();
  });

}
