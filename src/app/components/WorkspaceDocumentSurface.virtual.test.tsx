import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

import {
  INBOX_NODE_ID,
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID
} from '../../features/nodes/model/specialNodes';

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({ editorAppearanceKey: 'default', readingContentWidth: 720 })
}));

vi.mock('./DocumentPanelSection', () => ({
  DocumentPanelSection: ({ activeNodeId }: { activeNodeId: string | null }) => (
    <div>{activeNodeId ? `document ${activeNodeId}` : 'no document selected'}</div>
  )
}));

vi.mock('./VirtualDocumentSurface', () => ({
  VirtualBuiltInDocumentSurface: ({ activeVirtualNodeId }: { activeVirtualNodeId: string }) => (
    <div>{`built-in list ${activeVirtualNodeId}`}</div>
  )
}));

vi.mock('./workspaceDocumentSectionProps', () => ({
  buildDocumentSectionProps: (activeNodeId: string | null) => ({ activeNodeId })
}));

vi.mock('../../shared/ui', () => ({
  ScalablePanel: ({ children }: { children: ReactNode }) => <>{children}</>
}));

import { WorkspaceDocumentSurface } from './WorkspaceDocumentSurface';
import { createWorkspaceContentNode } from './WorkspaceDualListContent.testUtils';

function createProps(overrides = {}) {
  return {
    activeVirtualNodeId: VIRTUAL_REMOVED_NODE_ID,
    canGoBack: false,
    canGoForward: false,
    documentNodeId: 'stale-topic',
    isExternalViewOpen: false,
    isImmersiveEditing: false,
    isImmersiveMode: false,
    isPriorityQuickSetActive: false,
    isTrashViewOpen: false,
    isVirtualViewOpen: true,
    isWorkspaceHydrated: true,
    nodeOrder: [INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, 'stale-topic', 'removed-topic'],
    nodesById: {
      [INBOX_NODE_ID]: createWorkspaceContentNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
      [VIRTUAL_ROOT_NODE_ID]: createWorkspaceContentNode({ id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual' }),
      'stale-topic': createWorkspaceContentNode({ id: 'stale-topic', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Stale Topic' }),
      'removed-topic': createWorkspaceContentNode({ id: 'removed-topic', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Removed Topic' })
    },
    onEnterImmersiveEdit: vi.fn(),
    onGoBack: vi.fn(),
    onGoForward: vi.fn(),
    onSelectNode: vi.fn(),
    onShouldSuppressSelectionRestore: vi.fn(),
    trashedNodeIds: ['removed-topic'],
    ...overrides
  } as unknown as Parameters<typeof WorkspaceDocumentSurface>[0];
}

it('routes Removed to its built-in content list', () => {
  render(<WorkspaceDocumentSurface {...createProps()} />);

  expect(screen.getByText(`built-in list ${VIRTUAL_REMOVED_NODE_ID}`)).toBeInTheDocument();
  expect(screen.queryByText('document stale-topic')).toBeNull();
});

it('routes Shelved to its built-in content list', () => {
  render(<WorkspaceDocumentSurface {...createProps({ activeVirtualNodeId: VIRTUAL_SHELVED_NODE_ID })} />);

  expect(screen.getByText(`built-in list ${VIRTUAL_SHELVED_NODE_ID}`)).toBeInTheDocument();
});

it('keeps the Virtual root document surface when the Virtual root is active', () => {
  render(
    <WorkspaceDocumentSurface
      {...createProps({
        activeVirtualNodeId: VIRTUAL_ROOT_NODE_ID,
        documentNodeId: VIRTUAL_ROOT_NODE_ID
      })}
    />
  );

  expect(screen.getByText(`document ${VIRTUAL_ROOT_NODE_ID}`)).toBeInTheDocument();
});

it('keeps a saved search document surface when that saved search is active', () => {
  render(
    <WorkspaceDocumentSurface
      {...createProps({
        activeVirtualNodeId: 'virtual-a',
        documentNodeId: 'virtual-a',
        nodeOrder: [INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID, 'virtual-a', 'topic-a'],
        nodesById: {
          [INBOX_NODE_ID]: createWorkspaceContentNode({ id: INBOX_NODE_ID, kind: 'folder', specialKind: 'inbox', title: 'Inbox' }),
          [VIRTUAL_ROOT_NODE_ID]: createWorkspaceContentNode({ id: VIRTUAL_ROOT_NODE_ID, kind: 'folder', specialKind: 'virtual-root', title: 'Virtual' }),
          'virtual-a': createWorkspaceContentNode({
            id: 'virtual-a',
            kind: 'folder',
            parentNodeId: VIRTUAL_ROOT_NODE_ID,
            specialKind: 'virtual',
            title: 'Saved Search',
            virtualFilter: { conditions: [{ field: 'text', operator: 'contains', value: 'alpha' }], match: 'all', version: 1 }
          }),
          'topic-a': createWorkspaceContentNode({ id: 'topic-a', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Alpha Topic' })
        },
        trashedNodeIds: []
      })}
    />
  );

  expect(screen.getByText('document virtual-a')).toBeInTheDocument();
});
