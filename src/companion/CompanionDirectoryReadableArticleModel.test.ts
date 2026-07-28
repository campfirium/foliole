import { describe, expect, it, vi } from 'vitest';

import {
  canRenderCompanionDirectoryArticle,
  resolveCompanionDirectoryArticleExit
} from './CompanionDirectoryReadableArticleModel';

function createArgs(selectedBrowseNodeId: string, trashedNodeIds: string[]) {
  const nodeIds = Array.from(new Set([selectedBrowseNodeId, ...trashedNodeIds]));
  return {
    directorySelection: { kind: 'trash' as const },
    surface: {
      browsedFolder: null,
      readableArticle: { nodeId: selectedBrowseNodeId },
      selectedBrowseNodeId
    },
    workspaceSync: {
      state: {
        workspace_snapshot: {
          nodeOrder: nodeIds,
          nodesById: Object.fromEntries(nodeIds.map((id) => [id, { id }])),
          trashedNodeIds
        }
      }
    }
  } as never;
}

describe('canRenderCompanionDirectoryArticle', () => {
  it('does not let a stale normal topic replace the trash list', () => {
    expect(canRenderCompanionDirectoryArticle(createArgs('topic-1', ['trashed-topic']))).toBe(false);
  });

  it('allows a selected trash topic to open from trash', () => {
    expect(canRenderCompanionDirectoryArticle(createArgs('trashed-topic', ['trashed-topic']))).toBe(true);
  });
});

describe('resolveCompanionDirectoryArticleExit', () => {
  it('clears directory article detail without changing the directory selection', () => {
    const handleExitDirectoryArticle = vi.fn();
    const onBackDirectorySelection = vi.fn();
    const onExit = resolveCompanionDirectoryArticleExit({
      directorySelection: { kind: 'internal', nodeId: 'folder-1' },
      onBackDirectorySelection,
      surface: { handleExitDirectoryArticle } as never
    });

    onExit();

    expect(handleExitDirectoryArticle).toHaveBeenCalledTimes(1);
    expect(onBackDirectorySelection).not.toHaveBeenCalled();
  });

  it('keeps trash open when exiting a trashed topic', () => {
    const handleExitDirectoryArticle = vi.fn();
    const onBackDirectorySelection = vi.fn();
    const onExit = resolveCompanionDirectoryArticleExit({
      directorySelection: { kind: 'trash' },
      onBackDirectorySelection,
      surface: { handleExitDirectoryArticle } as never
    });

    onExit();

    expect(handleExitDirectoryArticle).toHaveBeenCalledTimes(1);
    expect(onBackDirectorySelection).not.toHaveBeenCalled();
  });
});
