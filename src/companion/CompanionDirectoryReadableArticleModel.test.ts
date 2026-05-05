import { describe, expect, it, vi } from 'vitest';

import {
  canRenderCompanionDirectoryArticle,
  resolveCompanionDirectoryArticleExit
} from './CompanionDirectoryReadableArticleModel';

function createArgs(selectedBrowseNodeId: string, trashedNodeIds: string[]) {
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
  it('keeps trash open when exiting a trashed topic', () => {
    const handleTabAction = vi.fn();
    const onBackDirectorySelection = vi.fn();
    const onExit = resolveCompanionDirectoryArticleExit({
      directorySelection: { kind: 'trash' },
      onBackDirectorySelection,
      surface: { handleTabAction } as never
    });

    onExit();

    expect(handleTabAction).toHaveBeenCalledWith('recent');
    expect(onBackDirectorySelection).not.toHaveBeenCalled();
  });
});
