import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { DocumentPanelHeader } from './DocumentPanelHeader';

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({
    editorDisplayMode: 'preview' as const,
    toggleEditorDisplayMode: vi.fn()
  })
}));

it('shows the breadcrumb title without a kind label in the document header', () => {
  render(
    <DocumentPanelHeader
      activeNodeId="node-1"
      canGoBack
      canGoForward
      canGoParent={false}
      folderListToolbar={null}
      isFolderListView={false}
      isSourceUpdatePanelOpen={false}
      nodesById={{
        'node-1': {
          id: 'node-1',
          kind: 'item',
          title: 'Prompt',
          parentNodeId: null,
          content: 'Q',
          anchorLink: null,
          reveal: 'A',
          review: null,
          createdAt: '',
          updatedAt: ''
        }
      }}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onGoParent={vi.fn()}
      onSelectBreadcrumbNode={vi.fn()}
      onToggleSourceUpdatePanel={vi.fn()}
      showSourceUpdateAction={false}
    />
  );

  expect(screen.getByRole('button', { name: 'Prompt' })).toBeInTheDocument();
  expect(screen.queryByText('Item')).not.toBeInTheDocument();
});

it('shows folder list sorting instead of editor actions in folder mode', () => {
  render(
    <DocumentPanelHeader
      activeNodeId="node-1"
      canGoBack
      canGoForward
      canGoParent={false}
      folderListToolbar={<button type="button">Date</button>}
      isFolderListView
      isSourceUpdatePanelOpen={false}
      nodesById={{
        'node-1': {
          id: 'node-1',
          kind: 'folder',
          title: 'Inbox',
          parentNodeId: null,
          content: '',
          anchorLink: null,
          reveal: null,
          review: null,
          createdAt: '',
          updatedAt: ''
        }
      }}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onGoParent={vi.fn()}
      onSelectBreadcrumbNode={vi.fn()}
      onToggleSourceUpdatePanel={vi.fn()}
      showSourceUpdateAction={false}
    />
  );

  expect(screen.getByRole('button', { name: 'Date' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Inbox' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Document navigation actions')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('More editor options')).not.toBeInTheDocument();
});
