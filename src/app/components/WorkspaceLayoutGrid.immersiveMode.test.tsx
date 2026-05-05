import { render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceLayoutGrid } from './WorkspaceLayoutGrid';

const lifecycle = vi.hoisted(() => ({
  documentMounts: 0,
  documentUnmounts: 0
}));

vi.mock('./WorkspaceLayoutGridSections', () => {
  return {
    WorkspaceDocumentArea: () => {
      React.useEffect(() => {
        lifecycle.documentMounts += 1;
        return () => {
          lifecycle.documentUnmounts += 1;
        };
      }, []);
      return <div data-testid="document-area">document</div>;
    },
    WorkspaceLeftRail: () => <div data-testid="left-rail">left</div>,
    WorkspaceListArea: () => <div data-testid="list-area">list</div>
  };
});

vi.mock('./WorkspaceListSplitter', () => ({
  WorkspaceListSplitter: () => <div data-testid="list-splitter">splitter</div>
}));

vi.mock('./WorkspaceRightSidebar', () => ({
  WorkspaceRightSidebar: () => <div data-testid="right-sidebar">sidebar</div>
}));

vi.mock('./WorkspaceRightSidebarSplitter', () => ({
  WorkspaceRightSidebarSplitter: () => <div data-testid="right-sidebar-splitter">right-splitter</div>
}));

describe('WorkspaceLayoutGrid immersive mode', () => {
  afterEach(() => {
    lifecycle.documentMounts = 0;
    lifecycle.documentUnmounts = 0;
  });

  it('keeps the document area mounted when toggling immersive mode', () => {
    const { rerender, unmount } = render(
      <WorkspaceLayoutGrid
        activeRightPanelId="dev"
        documentNodeId="node-1"
        isImmersiveEditing={false}
        isImportManagementOpen={false}
        onEnterImmersiveEdit={() => undefined}
        onOpenImportManagement={() => undefined}
        onSelectNode={() => undefined}
        onShouldSuppressSelectionRestore={() => false}
        onStartClipboardImport={() => undefined}
        onStartImport={() => undefined}
        props={buildProps(false)}
      />
    );

    expect(lifecycle.documentMounts).toBe(1);
    expect(lifecycle.documentUnmounts).toBe(0);

    rerender(
      <WorkspaceLayoutGrid
        activeRightPanelId="dev"
        documentNodeId="node-1"
        isImmersiveEditing={false}
        isImportManagementOpen={false}
        onEnterImmersiveEdit={() => undefined}
        onOpenImportManagement={() => undefined}
        onSelectNode={() => undefined}
        onShouldSuppressSelectionRestore={() => false}
        onStartClipboardImport={() => undefined}
        onStartImport={() => undefined}
        props={buildProps(true)}
      />
    );

    expect(lifecycle.documentMounts).toBe(1);
    expect(lifecycle.documentUnmounts).toBe(0);

    unmount();

    expect(lifecycle.documentUnmounts).toBe(1);
  });
});

function buildProps(isImmersiveMode: boolean) {
  return {
    isImmersiveMode,
    isResizingList: false,
    isResizingRightSidebar: false,
    isListCollapsed: false,
    isRightSidebarCollapsed: false,
    listWidth: 280,
    rightSidebarWidth: 320,
    nodeOrder: [],
    nodesById: {},
    onResetLayout: () => undefined,
    onSplitterKeyDown: () => undefined,
    onSplitterPointerDown: () => undefined,
    onRightSidebarSplitterKeyDown: () => undefined,
    onRightSidebarSplitterPointerDown: () => undefined,
    onRevealAnchorInDocument: () => undefined,
    reviewCurrentNodeId: null,
    reviewPanelQueueNodeIds: [],
    reviewSchedulerSettings: null,
    trashedNodeIds: []
  } as never;
}
