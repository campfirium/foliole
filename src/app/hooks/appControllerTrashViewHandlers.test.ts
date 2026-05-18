import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createOpenExternalSelection,
  createToggleTrashView,
  createToggleVirtualView
} from './appControllerTrashViewHandlers';

describe('createToggleTrashView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enters the trash runtime mode when opening trash', () => {
    const closeVirtualView = vi.fn();
    const closeExternalView = vi.fn();
    const flushPendingEditorDraft = vi.fn();
    const setIsViewingTrashNode = vi.fn();
    const openTrashView = vi.fn();
    const toggleTrashView = createToggleTrashView({
      runtime: { flushPendingEditorDraft, setIsViewingTrashNode },
      externalView: { closeExternalView },
      trash: { isTrashViewOpen: false, openTrashView },
      virtualView: { closeVirtualView },
      ws: {}
    } as never);

    toggleTrashView();

    expect(flushPendingEditorDraft).toHaveBeenCalledTimes(1);
    expect(setIsViewingTrashNode).toHaveBeenCalledWith(true);
    expect(closeExternalView).toHaveBeenCalledTimes(1);
    expect(closeVirtualView).toHaveBeenCalledTimes(1);
    expect(openTrashView).toHaveBeenCalledTimes(1);
  });
});

describe('createToggleVirtualView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('always switches into virtual view instead of toggling back out when selecting the current virtual folder', () => {
    const closeTrashView = vi.fn();
    const closeExternalView = vi.fn();
    const flushPendingEditorDraft = vi.fn();
    const openVirtualView = vi.fn();
    const setIsViewingTrashNode = vi.fn();
    const openVirtual = createToggleVirtualView({
      runtime: { flushPendingEditorDraft, setIsViewingTrashNode },
      externalView: { closeExternalView },
      trash: { closeTrashView },
      virtualView: {
        activeVirtualNodeId: 'virtual-a',
        isVirtualViewOpen: true,
        openVirtualView
      },
      ws: {}
    } as never);

    openVirtual('virtual-a');

    expect(flushPendingEditorDraft).toHaveBeenCalledTimes(1);
    expect(setIsViewingTrashNode).toHaveBeenCalledWith(false);
    expect(closeExternalView).toHaveBeenCalledTimes(1);
    expect(closeTrashView).toHaveBeenCalledTimes(1);
    expect(openVirtualView).toHaveBeenCalledWith('virtual-a');
  });
});

describe('createOpenExternalSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('switches into external view and closes competing left-column views', () => {
    const closeTrashView = vi.fn();
    const closeVirtualView = vi.fn();
    const flushPendingEditorDraft = vi.fn();
    const openExternalSelection = vi.fn();
    const setIsViewingTrashNode = vi.fn();
    const openExternal = createOpenExternalSelection({
      externalView: { openExternalSelection },
      runtime: { flushPendingEditorDraft, setIsViewingTrashNode },
      trash: { closeTrashView },
      virtualView: { closeVirtualView },
      ws: {}
    } as never);

    openExternal({ folderId: 'folder-ext', kind: 'folder' });

    expect(flushPendingEditorDraft).toHaveBeenCalledTimes(1);
    expect(setIsViewingTrashNode).toHaveBeenCalledWith(false);
    expect(closeTrashView).toHaveBeenCalledTimes(1);
    expect(closeVirtualView).toHaveBeenCalledTimes(1);
    expect(openExternalSelection).toHaveBeenCalledWith({ folderId: 'folder-ext', kind: 'folder' });
  });
});
