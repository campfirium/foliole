import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import { toWorkspaceListNode } from '../../features/nodes/model/workspaceListNode';
import { SettingsExternalSearchSection } from '../../features/settings/components/sections/SettingsExternalSearchSection';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { definedProps } from '../../shared/lib/definedProps';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

vi.mock('./WorkspaceDocumentSurface', () => ({
  WorkspaceDocumentSurface: () => null
}));

import { WorkspaceListArea } from './WorkspaceLayoutGridSections';

beforeEach(() => {
  window.localStorage.clear();
});

function createNode(args: {
  id: string;
  kind: 'folder' | 'topic' | 'item';
  parentNodeId?: string | null;
  title: string;
}): Node {
  return {
    anchorLink: null,
    createdAt: '2026-04-21T00:00:00.000Z',
    content: '',
    hasContent: args.kind !== 'folder',
    hasReveal: args.kind === 'item',
    id: args.id,
    kind: args.kind,
    parentNodeId: args.parentNodeId ?? null,
    reading: null,
    reveal: null,
    review: null,
    title: args.title,
    updatedAt: '2026-04-21T00:00:00.000Z',
    virtualFilter: null,
    ...definedProps({ specialKind: args.id === INBOX_NODE_ID ? ('inbox' as const) : undefined })
  };
}

it('opens the simplified external folder setup dialog from the Connect folder row in the real list area', () => {
  const onOpenExternalLibrarySettings = vi.fn();
  const onOpenExternalSelection = vi.fn();
  const nodesById: Record<string, Node> = {
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' }),
    'folder-a': createNode({ id: 'folder-a', kind: 'folder', title: 'Projects' })
  };
  const listNodesById = Object.fromEntries(
    Object.entries(nodesById).map(([nodeId, node]) => [nodeId, toWorkspaceListNode(node)])
  );

  renderWithLocalization(
    <WorkspaceListArea
      activeNodeId="folder-a"
      activeVirtualNodeId={null}
      externalEntriesByFolderId={{}}
      externalFolders={[]}
      externalSelection={{ kind: 'root' }}
      isExternalViewOpen
      isStudyMode={false}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      isWorkspaceHydrated
      listNodesById={listNodesById}
      nodesById={nodesById}
      nodeOrder={[INBOX_NODE_ID, 'folder-a']}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={vi.fn()}
      onOpenExternalSelection={onOpenExternalSelection}
      onOpenExternalLibrarySettings={onOpenExternalLibrarySettings}
      onChangeExternalFolder={vi.fn()}
      onRemoveExternalFolder={vi.fn()}
      onRescanExternalFolder={vi.fn()}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={vi.fn()}
      onSelectNode={vi.fn()}
      onSelectNodeInVirtualView={vi.fn()}
      onSelectTrashNode={vi.fn()}
      reviewCurrentNodeId={null}
      selectedTrashNodeId={null}
      trashedNodeIds={[]}
    />
  );

  fireEvent.click(screen.getByRole('treeitem', { name: 'Connect folder' }));

  expect(onOpenExternalSelection).toHaveBeenCalledWith({ kind: 'root' });
  expect(screen.getByRole('dialog', { name: 'Connect an external folder' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Connect folder' }));
  expect(onOpenExternalLibrarySettings).toHaveBeenCalledTimes(1);
});

it('restores saved sidebar visibility and applies settings changes to the open workspace', () => {
  const onOpenExternalLibrarySettings = vi.fn();
  const nodesById: Record<string, Node> = {
    [INBOX_NODE_ID]: createNode({ id: INBOX_NODE_ID, kind: 'folder', title: 'Inbox' })
  };
  const listNodesById = Object.fromEntries(
    Object.entries(nodesById).map(([nodeId, node]) => [nodeId, toWorkspaceListNode(node)])
  );
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.externalFoldersEnabled, 'false');

  const workspace = (
    <WorkspaceListArea
      activeNodeId={INBOX_NODE_ID}
      activeVirtualNodeId={null}
      externalEntriesByFolderId={{}}
      externalFolders={[{
        attachmentMode: 'document_relative_first_then_fixed_root',
        attachmentRootPath: null,
        createdAt: '2026-04-21T00:00:00.000Z',
        documentCount: 1,
        excludedDirs: [],
        folderPath: '/library/1act',
        id: 'folder-1',
        indexedAt: '2026-04-21T00:00:00.000Z',
        lastError: null,
        status: 'ready',
        updatedAt: '2026-04-21T00:00:00.000Z'
      }]}
      externalSelection={{ kind: 'root' }}
      isExternalViewOpen
      isStudyMode={false}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      isWorkspaceHydrated
      listNodesById={listNodesById}
      nodesById={nodesById}
      nodeOrder={[INBOX_NODE_ID]}
      onOpenMoveToNode={vi.fn()}
      onOpenNotesView={vi.fn()}
      onOpenExternalSelection={vi.fn()}
      onOpenExternalLibrarySettings={onOpenExternalLibrarySettings}
      onChangeExternalFolder={vi.fn()}
      onRemoveExternalFolder={vi.fn()}
      onRescanExternalFolder={vi.fn()}
      onOpenTrashView={vi.fn()}
      onOpenVirtualView={vi.fn()}
      onSelectNode={vi.fn()}
      onSelectNodeInVirtualView={vi.fn()}
      onSelectTrashNode={vi.fn()}
      reviewCurrentNodeId={null}
      selectedTrashNodeId={null}
      trashedNodeIds={[]}
    />
  );

  const settings = (
    <SettingsExternalSearchSection
      error={null}
      feedback={null}
      folders={[]}
      isDesktopRuntime
      isLoading={false}
      isSaving={false}
      onAddFolder={vi.fn()}
      onChooseAttachmentRoot={vi.fn()}
      onChooseFolder={vi.fn()}
      onDisconnectFolder={vi.fn()}
      onReconnectFolder={vi.fn()}
      onRebuildIndex={vi.fn()}
      onRemoveFolder={vi.fn()}
      onRetryLoad={vi.fn()}
      onUpdateFolder={vi.fn()}
    />
  );
  const view = renderWithLocalization(<>{workspace}{settings}</>);
  const storageKey = APP_SETTINGS_STORAGE_KEYS.externalFoldersEnabled;

  expect(screen.queryByRole('treeitem', { name: /^External$/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('treeitem', { name: /1act/i })).not.toBeInTheDocument();

  const visibilitySwitch = screen.getByRole('switch', { name: 'Enable external folders' });
  expect(visibilitySwitch).not.toBeChecked();
  fireEvent.click(visibilitySwitch);

  expect(visibilitySwitch).toBeChecked();
  expect(window.localStorage.getItem(storageKey)).toBe('true');
  expect(screen.getByRole('treeitem', { name: /^External$/ })).toBeVisible();
  expect(screen.getByRole('treeitem', { name: /1act/i })).toBeVisible();

  fireEvent.click(visibilitySwitch);

  expect(visibilitySwitch).not.toBeChecked();
  expect(window.localStorage.getItem(storageKey)).toBe('false');
  expect(screen.queryByRole('treeitem', { name: /^External$/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('treeitem', { name: /1act/i })).not.toBeInTheDocument();
  expect(onOpenExternalLibrarySettings).not.toHaveBeenCalled();

  view.unmount();
  renderWithLocalization(workspace);
  expect(screen.queryByRole('treeitem', { name: /^External$/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('treeitem', { name: /1act/i })).not.toBeInTheDocument();
});
