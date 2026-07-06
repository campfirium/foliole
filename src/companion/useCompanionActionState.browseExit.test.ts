import { describe, expect, it, vi } from 'vitest';

import { useCompanionActionState } from './useCompanionActionState';

function createActionState(args?: {
  browseReturnNodeId?: string | null;
  browsedFolderNodeId?: string | null;
}) {
  const floatingBar = { revealBar: vi.fn() };
  const setActiveAction = vi.fn();
  const setBrowseReturnNodeId = vi.fn();
  const setReadingError = vi.fn();
  const setReviewError = vi.fn();
  const setSelectedBrowseNodeId = vi.fn();
  const workspaceSync = { replaceSnapshot: vi.fn(), state: { workspace_snapshot: null } };

  const actions = useCompanionActionState({
    browseReturnNodeId: args?.browseReturnNodeId ?? null,
    browsedFolderNodeId: args?.browsedFolderNodeId ?? null,
    floatingBar,
    setActiveAction,
    setBrowseReturnNodeId,
    setReadingError,
    setReviewError,
    setSelectedBrowseNodeId,
    snapshot: null,
    workspaceSync
  } as never);

  return { actions, setActiveAction, setBrowseReturnNodeId, setSelectedBrowseNodeId };
}

describe('useCompanionActionState browse exit', () => {
  it('returns recent article opens to the recent list', () => {
    const { actions, setActiveAction, setBrowseReturnNodeId, setSelectedBrowseNodeId } = createActionState();

    actions.handleSelectRecentArticle('topic-1');
    actions.handleExitBrowseArticle();

    expect(setBrowseReturnNodeId).toHaveBeenCalledWith(null);
    expect(setSelectedBrowseNodeId).toHaveBeenLastCalledWith(null);
    expect(setActiveAction).toHaveBeenLastCalledWith('recent');
  });

  it('returns folder list opens to that folder', () => {
    const { actions, setBrowseReturnNodeId, setSelectedBrowseNodeId } = createActionState({
      browseReturnNodeId: 'folder-1',
      browsedFolderNodeId: null
    });

    actions.handleExitBrowseArticle();

    expect(setSelectedBrowseNodeId).toHaveBeenCalledWith('folder-1');
    expect(setBrowseReturnNodeId).toHaveBeenCalledWith(null);
  });

  it('records the current browsed folder before opening a topic from it', () => {
    const { actions, setBrowseReturnNodeId, setSelectedBrowseNodeId } = createActionState({
      browsedFolderNodeId: 'folder-1'
    });

    actions.handleSelectBrowseNode('topic-1');

    expect(setBrowseReturnNodeId).toHaveBeenCalledWith('folder-1');
    expect(setSelectedBrowseNodeId).toHaveBeenCalledWith('topic-1');
  });

  it('clears directory article detail without using the folder return node', () => {
    const { actions, setActiveAction, setBrowseReturnNodeId, setSelectedBrowseNodeId } = createActionState({
      browseReturnNodeId: 'folder-1'
    });

    actions.handleExitDirectoryArticle();

    expect(setBrowseReturnNodeId).toHaveBeenCalledWith(null);
    expect(setSelectedBrowseNodeId).toHaveBeenCalledWith(null);
    expect(setSelectedBrowseNodeId).not.toHaveBeenCalledWith('folder-1');
    expect(setActiveAction).toHaveBeenLastCalledWith('recent');
  });

  it('returns search article opens to the search tab without changing browse exit semantics', () => {
    const { actions, setActiveAction, setBrowseReturnNodeId, setSelectedBrowseNodeId } = createActionState({
      browseReturnNodeId: 'folder-1'
    });

    actions.handleExitSearchArticle();

    expect(setBrowseReturnNodeId).toHaveBeenCalledWith(null);
    expect(setSelectedBrowseNodeId).toHaveBeenCalledWith(null);
    expect(setActiveAction).toHaveBeenLastCalledWith('search');
  });
});
