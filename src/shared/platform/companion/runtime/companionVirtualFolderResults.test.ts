import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';

const mocks = vi.hoisted(() => ({ readDatabase: vi.fn() }));

vi.mock('./iosCompanionActiveDatabase', () => ({
  readIosCompanionDatabase: mocks.readDatabase
}));

import { loadCompanionVirtualFolderResultIds } from './companionVirtualFolderResults';

function snapshot(): WorkspaceSnapshot {
  const base = {
    anchorLink: null, content: '', createdAt: '2026-09-22T00:00:00.000Z', hideTitleHeading: false,
    isTitleManual: false, reading: null, reveal: null, review: null, updatedAt: '2026-09-22T00:00:00.000Z'
  };
  return {
    activeNodeId: 'virtual', nodeOrder: ['virtual', 'a', 'b'], trashedNodeIds: [], untitledSequenceByParent: {},
    nodesById: {
      virtual: { ...base, id: 'virtual', kind: 'folder', manualChildOrder: null, parentNodeId: null, title: 'Filtered',
        virtualFilter: { version: 1, match: 'all', conditions: [
          { field: 'text', operator: 'contains', value: 'needle' },
          { field: 'collection', operator: 'equals', value: 'Keep' }
        ] } },
      a: { ...base, collections: ['Keep'], id: 'a', kind: 'topic', parentNodeId: null, title: 'A' },
      b: { ...base, collections: ['Other'], id: 'b', kind: 'topic', parentNodeId: null, title: 'B' }
    }
  };
}

describe('companionVirtualFolderResults', () => {
  beforeEach(() => {
    mocks.readDatabase.mockReset();
  });

  it('returns only ids matching database text and lightweight collection metadata', async () => {
    mocks.readDatabase.mockImplementation(async (...args: unknown[]) => {
      const task = args.find((value): value is (db: unknown) => Promise<unknown> => typeof value === 'function');
      if (!task) throw new Error(`missing_task:${JSON.stringify(args)}`);
      return task({ query: vi.fn(async () => [{ id: 'a' }, { id: 'b' }]) });
    });

    await expect(loadCompanionVirtualFolderResultIds(snapshot(), 'virtual')).resolves.toEqual(['a']);
  });

  it('keeps only available readable nodes from a manual virtual folder', async () => {
    const current = snapshot();
    current.nodesById.virtual!.virtualFilter = {
      conditions: [{ field: 'manual', operator: 'equals', value: 'manual-child-order' }],
      match: 'all',
      version: 1
    };
    current.nodesById.virtual!.manualChildOrder = ['missing', 'virtual', 'b', 'a'];

    await expect(loadCompanionVirtualFolderResultIds(current, 'virtual')).resolves.toEqual(['b', 'a']);
    expect(mocks.readDatabase).not.toHaveBeenCalled();
  });
});
