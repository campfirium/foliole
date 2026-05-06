import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

const { windowTitleBarRender, workspaceLayoutGridRender } = vi.hoisted(() => ({
  windowTitleBarRender: vi.fn(),
  workspaceLayoutGridRender: vi.fn()
}));

vi.mock('./WindowTitleBar', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    WindowTitleBar: React.memo((props: unknown) => {
      windowTitleBarRender(props);
      return <div data-testid="window-titlebar" />;
    })
  };
});

vi.mock('./WorkspaceLayoutGrid', () => ({
  WorkspaceLayoutGrid: (props: { props: { imports: { onStartClipboardImport: () => void } } }) => {
    workspaceLayoutGridRender(props);
    return <button data-testid="workspace-grid" onClick={props.props.imports.onStartClipboardImport} type="button" />;
  }
}));

vi.mock('./ImportSourceWorkspace', () => ({
  ImportSourceWorkspace: () => null
}));

vi.mock('./WorkspaceSettingsOverlay', () => ({
  selectWorkspaceSettingsOverlayProps: (props: {
    isSettingsOpen: boolean;
    onCloseSettings: () => void;
    requestedSettingsCategory: unknown;
  }) => ({
    isSettingsOpen: props.isSettingsOpen,
    onClose: props.onCloseSettings,
    requestedCategory: props.requestedSettingsCategory
  }),
  WorkspaceSettingsOverlay: () => null
}));

vi.mock('./ImmersiveShortcutsOverlay', () => ({
  ImmersiveShortcutsOverlay: () => null
}));

vi.mock('./useImmersiveReadingMode', () => ({
  useImmersiveReadingMode: () => ({
    enterImmersiveEdit: () => undefined,
    isImmersiveEditing: false,
    isShortcutsOverlayOpen: false,
    shouldSuppressSelectionRestore: () => false
  })
}));

import { groupWorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import { WorkspaceLayoutMain } from './WorkspaceLayoutMain';
import type { WorkspaceLayoutFlatProps } from './workspaceLayoutProps';

function createNode(overrides: Partial<Node> & Pick<Node, 'id' | 'kind' | 'parentNodeId' | 'title'>): Node {
  const { id, kind, parentNodeId, title, ...rest } = overrides;
  return {
    ...rest,
    content: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    id,
    kind,
    parentNodeId,
    reveal: '',
    review: null,
    title,
    updatedAt: '2024-01-01T00:00:00.000Z'
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createProps(overrides: Partial<WorkspaceLayoutFlatProps> = {}) {
  const onCloseImportManagement = vi.fn();
  const onOpenNotesView = vi.fn();
  const onOpenVirtualView = vi.fn();
  const onOpenTrashView = vi.fn();
  const onSelectNode = vi.fn();
  const onToggleRightSidebarVisibility = vi.fn();
  const flatProps = {
    activeNodeId: 'node-1',
    editorContent: 'Version 1',
    externalEntriesByFolderId: {},
    externalFolders: [],
    externalSelection: { kind: 'root' },
    isExternalViewOpen: false,
    isImmersiveMode: false,
    isImportManagementOpen: false,
    isListCollapsed: false,
    isRightSidebarCollapsed: false,
    isTrashViewOpen: false,
    isViewingTrashNode: false,
    isVirtualViewOpen: false,
    listWidth: 280,
    nodesById: {
      'node-1': createNode({ id: 'node-1', kind: 'topic', parentNodeId: null, title: 'Node 1' })
    },
    onCloseImportManagement,
    onOpenImportManagement: vi.fn(),
    onOpenNotesView,
    onOpenTrashView,
    onOpenVirtualView,
    onRunImportFile: vi.fn(async () => true),
    onSelectNode,
    onStartClipboardImport: vi.fn(),
    onToggleListVisibility: vi.fn(),
    onToggleRightSidebarVisibility,
    rightSidebarWidth: 320,
    selectedTrashNodeId: null,
    shouldSuppressNavigationSelectionRestore: () => false,
    ...overrides
  } as WorkspaceLayoutFlatProps;
  return groupWorkspaceLayoutProps(flatProps) as ComponentProps<typeof WorkspaceLayoutMain>;
}

beforeEach(() => {
  windowTitleBarRender.mockClear();
  workspaceLayoutGridRender.mockClear();
});

describe('WorkspaceLayoutMain title bar rendering', () => {
  it('keeps the title bar steady when only document content changes', () => {
    const props = createProps();
    const { rerender } = render(<WorkspaceLayoutMain {...props} />);

    expect(windowTitleBarRender).toHaveBeenCalledTimes(1);

    rerender(
      <WorkspaceLayoutMain
        {...props}
        document={{ ...props.document, editorContent: 'Version 2' }}
      />
    );

    expect(windowTitleBarRender).toHaveBeenCalledTimes(1);
  });

  it('shows transient feedback while importing clipboard content', async () => {
    const importResult = createDeferred<boolean>();
    const onStartClipboardImport = vi.fn(() => importResult.promise);
    render(<WorkspaceLayoutMain {...createProps({ onStartClipboardImport })} />);

    fireEvent.click(screen.getByTestId('workspace-grid'));

    expect(await screen.findByRole('status')).toHaveTextContent('Importing clipboard...');
    importResult.resolve(true);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Clipboard imported to Inbox');
    });
    expect(onStartClipboardImport).toHaveBeenCalledTimes(1);
  });

  it('forwards the top-level article title when a derived node is selected', () => {
    render(
      <WorkspaceLayoutMain
        {...createProps({
          activeNodeId: 'node-child',
          nodesById: {
            'folder-1': createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Inbox' }),
            'node-root': createNode({ id: 'node-root', kind: 'topic', parentNodeId: 'folder-1', title: 'Article title' }),
            'node-child': createNode({ id: 'node-child', kind: 'item', parentNodeId: 'node-root', title: 'Derived card' })
          }
        })}
      />
    );

    expect(windowTitleBarRender).toHaveBeenCalledWith(expect.objectContaining({ centerTitle: 'Article title' }));
  });

  it('forwards the folder title when a folder is selected', () => {
    render(
      <WorkspaceLayoutMain
        {...createProps({
          activeNodeId: 'folder-1',
          nodesById: {
            'folder-1': createNode({ id: 'folder-1', kind: 'folder', parentNodeId: null, title: 'Projects' })
          }
        })}
      />
    );

    expect(windowTitleBarRender).toHaveBeenCalledWith(expect.objectContaining({ centerTitle: 'Projects' }));
  });

  it('does not render an extra full-height divider over the list splitter', () => {
    const { container } = render(<WorkspaceLayoutMain {...createProps()} />);

    expect(container.querySelector('.pointer-events-none.absolute.inset-y-0.z-10.w-px.bg-divider')).toBeNull();
  });
});

describe('WorkspaceLayoutMain external title bar rendering', () => {
  it('forwards the external document title and marker when an external document is selected', () => {
    render(
      <WorkspaceLayoutMain
        {...createProps({
          activeNodeId: null,
          externalEntriesByFolderId: {
            'folder-1': [{
              absolutePath: '/library/cap/topic.md',
              extension: 'md',
              fileName: 'topic.md',
              folderId: 'folder-1',
              folderPath: '/library',
              modifiedAt: '2026-04-25T00:00:00.000Z',
              openingText: null,
              relativePath: 'cap/topic.md',
              title: 'External topic title'
            }]
          },
          externalSelection: { absolutePath: '/library/cap/topic.md', folderId: 'folder-1', kind: 'document' },
          isExternalViewOpen: true
        })}
      />
    );

    expect(windowTitleBarRender).toHaveBeenCalledWith(expect.objectContaining({
      centerTitle: 'External topic title',
      centerTitleIcon: 'external'
    }));
  });
});
