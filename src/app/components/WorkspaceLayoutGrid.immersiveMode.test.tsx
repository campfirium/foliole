import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceLayoutGrid } from './WorkspaceLayoutGrid';
import { groupWorkspaceLayoutProps } from './workspaceLayoutGroupedProps';

const lifecycle = vi.hoisted(() => ({
  documentMounts: 0,
  documentUnmounts: 0,
  documentRenders: 0,
  listAreaCalls: [] as Array<{ listNodesById: unknown }>
}));

vi.mock('./WorkspaceLayoutGridSections', () => createGridSectionsMock());

vi.mock('./WorkspaceLeftRail', () => ({
  selectWorkspaceLeftRailProps: (args: { props: unknown }) => args.props,
  WorkspaceLeftRail: () => <div data-testid="left-rail">left</div>
}));

vi.mock('./WorkspaceListSplitter', () => ({
  WorkspaceListSplitter: () => <div data-testid="list-splitter">splitter</div>
}));

vi.mock('./WorkspaceRightSidebar', () => ({
  WorkspaceRightSidebar: (props: { onSelectNode: unknown; onSelectBreadcrumbNode: unknown }) => (
    <WorkspaceRightSidebarProbe {...props} />
  )
}));

vi.mock('./WorkspaceRightSidebarSplitter', () => ({
  WorkspaceRightSidebarSplitter: () => <div data-testid="right-sidebar-splitter">right-splitter</div>
}));

afterEach(() => {
  lifecycle.documentMounts = 0;
  lifecycle.documentUnmounts = 0;
  lifecycle.documentRenders = 0;
  lifecycle.listAreaCalls = [];
});

describe('WorkspaceLayoutGrid immersive mode mounting', () => {
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

  it('renders only the document area while immersive mode is active', () => {
    renderGrid(buildProps(true));

    expect(screen.getByTestId('document-area')).toBeInTheDocument();
    expect(screen.queryByTestId('list-area')).toBeNull();
    expect(screen.queryByTestId('list-splitter')).toBeNull();
    expect(screen.queryByTestId('right-sidebar')).toBeNull();
    expect(screen.queryByTestId('right-sidebar-splitter')).toBeNull();
  });
});

describe('WorkspaceLayoutGrid right sidebar wiring', () => {
  it('forwards breadcrumb selection into the right sidebar', () => {
    const { getByTestId } = renderGrid(buildProps(false));

    expect(getByTestId('right-sidebar')).toHaveAttribute('data-breadcrumb-type', 'function');
    expect(getByTestId('right-sidebar')).toHaveAttribute('data-select-type', 'function');
  });

  it('keeps right sidebar wrappers gated behind the xl desktop breakpoint', () => {
    const { getByTestId } = renderGrid(buildProps(false));

    expect(getByTestId('right-sidebar').parentElement).toHaveClass('hidden', 'xl:flex');
    expect(getByTestId('right-sidebar-splitter').parentElement).toHaveClass('hidden', 'xl:flex');
  });

  it('keeps the list projection stable when only document body fields change', () => {
    const nodesByIdA = {
      'node-1': buildNode({ id: 'node-1', content: 'Version 1', title: 'Atlas' })
    };
    const { rerender } = renderGrid(buildProps(false, nodesByIdA));

    const firstProjection = lifecycle.listAreaCalls.at(-1)?.listNodesById;
    const nodesByIdB = {
      'node-1': buildNode({ id: 'node-1', content: 'Version 2', title: 'Atlas' })
    };
    rerender(createGridElement(buildProps(false, nodesByIdB)));

    expect(lifecycle.listAreaCalls.at(-1)?.listNodesById).toBe(firstProjection);
  });

  it('keeps the document area steady when only the right sidebar panel changes', () => {
    const props = buildProps(false);
    const { rerender } = render(
      <WorkspaceLayoutGrid
        activeRightPanelId="source-info"
        documentNodeId="node-1"
        isImmersiveEditing={false}
        isImportManagementOpen={false}
        onEnterImmersiveEdit={STABLE_NOOP}
        onOpenImportManagement={STABLE_NOOP}
        onSelectNode={STABLE_SELECT_NODE}
        onShouldSuppressSelectionRestore={STABLE_FALSE}
        onStartClipboardImport={STABLE_NOOP}
        onStartImport={STABLE_NOOP}
        props={props}
      />
    );

    expect(lifecycle.documentRenders).toBe(1);

    rerender(
      <WorkspaceLayoutGrid
        activeRightPanelId="dev"
        documentNodeId="node-1"
        isImmersiveEditing={false}
        isImportManagementOpen={false}
        onEnterImmersiveEdit={STABLE_NOOP}
        onOpenImportManagement={STABLE_NOOP}
        onSelectNode={STABLE_SELECT_NODE}
        onShouldSuppressSelectionRestore={STABLE_FALSE}
        onStartClipboardImport={STABLE_NOOP}
        onStartImport={STABLE_NOOP}
        props={props}
      />
    );

    expect(lifecycle.documentRenders).toBe(1);
  });
});

function WorkspaceRightSidebarProbe(props: { onSelectNode: unknown; onSelectBreadcrumbNode: unknown }) {
  return (
    <div
      data-breadcrumb-type={typeof props.onSelectBreadcrumbNode}
      data-select-type={typeof props.onSelectNode}
      data-testid="right-sidebar"
    >
      sidebar
    </div>
  );
}

function WorkspaceDocumentAreaProbe() {
  lifecycle.documentRenders += 1;
  React.useEffect(() => {
    lifecycle.documentMounts += 1;
    return () => {
      lifecycle.documentUnmounts += 1;
    };
  }, []);
  return <div data-testid="document-area">document</div>;
}

function createGridSectionsMock() {
  return {
    WorkspaceDocumentArea: React.memo(WorkspaceDocumentAreaProbe),
    WorkspaceLeftRail: () => <div data-testid="left-rail">left</div>,
    WorkspaceListArea: (props: { listNodesById: unknown }) => {
      lifecycle.listAreaCalls.push({ listNodesById: props.listNodesById });
      return <div data-testid="list-area">list</div>;
    },
    ReviewModeToolbar: () => <div data-testid="review-toolbar">toolbar</div>
  };
}

function createGridElement(props: ReturnType<typeof buildProps>) {
  return (
    <WorkspaceLayoutGrid
      activeRightPanelId="source-info"
      documentNodeId="node-1"
      isImmersiveEditing={false}
      isImportManagementOpen={false}
      onEnterImmersiveEdit={STABLE_NOOP}
      onOpenImportManagement={STABLE_NOOP}
      onSelectNode={STABLE_SELECT_NODE}
      onShouldSuppressSelectionRestore={STABLE_FALSE}
      onStartClipboardImport={STABLE_NOOP}
      onStartImport={STABLE_NOOP}
      props={props}
    />
  );
}

function renderGrid(props: ReturnType<typeof buildProps>) {
  return render(createGridElement(props));
}

const STABLE_NOOP = () => undefined;
const STABLE_FALSE = () => false;
const STABLE_SELECT_NODE = () => undefined;

function buildNode(args: { id: string; content: string; reveal?: string | null; title: string }) {
  return {
    id: args.id,
    kind: 'topic',
    parentNodeId: null,
    title: args.title,
    content: args.content,
    reveal: args.reveal ?? null,
    review: null,
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z'
  };
}

function buildProps(isImmersiveMode: boolean, nodesById: Record<string, unknown> = {}) {
  return groupWorkspaceLayoutProps({
    isImmersiveMode,
    isResizingList: false,
    isResizingRightSidebar: false,
    isListCollapsed: false,
    isRightSidebarCollapsed: false,
    listWidth: 280,
    rightSidebarWidth: 320,
    nodeOrder: Object.keys(nodesById),
    nodesById,
    nodeViewById: {},
    onSelectBreadcrumbNode: () => undefined,
    onResetLayout: () => undefined,
    onSplitterKeyDown: () => undefined,
    onSplitterPointerDown: () => undefined,
    onRightSidebarSplitterKeyDown: () => undefined,
    onRightSidebarSplitterPointerDown: () => undefined,
    onRevealAnchorInDocument: () => undefined,
    getReadingPositionSelection: () => null,
    setNodeViewState: () => undefined,
    reviewCurrentNodeId: null,
    reviewPanelQueueNodeIds: [],
    reviewSchedulerSettings: null,
    trashedNodeIds: []
  } as never);
}
