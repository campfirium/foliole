import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';

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
      backlinks={[]}
      canGoBack
      canGoForward
      canGoParent={false}
      editableNodeId="node-1"
      folderListToolbar={null}
      isFolderListView={false}
      isSourceUpdatePanelOpen={false}
      nodesById={{
        'topic-1': {
          id: 'topic-1',
          kind: 'topic',
          title: 'Inbox',
          parentNodeId: null,
          content: '',
          anchorLink: null,
          reveal: null,
          review: null,
          createdAt: '',
          updatedAt: ''
        },
        'node-1': {
          id: 'node-1',
          kind: 'item',
          title: 'Prompt',
          parentNodeId: 'topic-1',
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
      onNodePriorityChange={vi.fn()}
      onSelectBacklinkNode={vi.fn()}
      onSelectBreadcrumbNode={vi.fn()}
      onToggleSourceUpdatePanel={vi.fn()}
      priorityQuickSetShortcutLabel="Ctrl+M"
      reviewSchedulerSettings={DEFAULT_REVIEW_SCHEDULER_SETTINGS}
      showSourceUpdateAction={false}
    />
  );

  expect(screen.getByText('Inbox')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Priority P5 from the default fallback/i })).toBeInTheDocument();
  expect(screen.queryByText('Item')).not.toBeInTheDocument();
});

it('keeps breadcrumb and priority controls on the document content rail', () => {
  render(
    <DocumentPanelHeader
      activeNodeId="node-1"
      backlinks={[]}
      canGoBack
      canGoForward
      canGoParent={false}
      editableNodeId="node-1"
      folderListToolbar={null}
      isFolderListView={false}
      isSourceUpdatePanelOpen={false}
      nodesById={{
        'topic-1': {
          id: 'topic-1',
          kind: 'topic',
          title: 'Inbox',
          parentNodeId: null,
          content: '',
          anchorLink: null,
          reveal: null,
          review: null,
          createdAt: '',
          updatedAt: ''
        },
        'node-1': {
          id: 'node-1',
          kind: 'item',
          title: 'Prompt',
          parentNodeId: 'topic-1',
          content: '',
          anchorLink: null,
          reveal: '',
          review: null,
          createdAt: '',
          updatedAt: ''
        }
      }}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onGoParent={vi.fn()}
      onNodePriorityChange={vi.fn()}
      onSelectBacklinkNode={vi.fn()}
      onSelectBreadcrumbNode={vi.fn()}
      onToggleSourceUpdatePanel={vi.fn()}
      priorityQuickSetShortcutLabel="Ctrl+M"
      reviewSchedulerSettings={DEFAULT_REVIEW_SCHEDULER_SETTINGS}
      showSourceUpdateAction={false}
    />
  );

  const rail = screen.getByTestId('document-header-content-rail');
  expect(rail.closest('header')).toHaveClass('min-h-8');
  expect(rail.closest('header')).toHaveClass('pr-4');
  expect(rail.closest('header')).toHaveClass('max-[1080px]:px-2');
  expect(rail).toHaveClass('max-w-[var(--document-max-width)]');
  expect(rail).toHaveClass('px-[var(--document-content-inline-padding)]');
  expect(rail).toContainElement(screen.getByRole('button', { name: 'Inbox' }));
  expect(rail).toContainElement(screen.getByRole('button', { name: /Priority P5 from the default fallback/i }));
});

it('keeps the folder-mode header free of right-side actions', () => {
  render(
    <DocumentPanelHeader
      activeNodeId="node-1"
      backlinks={[]}
      canGoBack
      canGoForward
      canGoParent={false}
      editableNodeId="node-1"
      folderListToolbar={null}
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
      onNodePriorityChange={vi.fn()}
      onSelectBacklinkNode={vi.fn()}
      onSelectBreadcrumbNode={vi.fn()}
      onToggleSourceUpdatePanel={vi.fn()}
      priorityQuickSetShortcutLabel="Ctrl+M"
      reviewSchedulerSettings={DEFAULT_REVIEW_SCHEDULER_SETTINGS}
      showSourceUpdateAction={false}
    />
  );

  expect(screen.queryByRole('button', { name: 'Inbox' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Document navigation actions')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('More editor options')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sort list by Imported' })).not.toBeInTheDocument();
});

it('shows a backlinks trigger with count and opens the inline backlinks menu', () => {
  render(
    <DocumentPanelHeader
      activeNodeId="node-1"
      backlinks={[
        {
          context: 'See follow-up note',
          matchCount: 1,
          sourceNodeId: 'node-2',
          sourceTitle: 'Linked note'
        }
      ]}
      canGoBack
      canGoForward
      canGoParent={false}
      editableNodeId="node-1"
      folderListToolbar={null}
      isFolderListView={false}
      isSourceUpdatePanelOpen={false}
      nodesById={{
        'node-1': {
          id: 'node-1',
          kind: 'topic',
          title: 'Topic',
          parentNodeId: null,
          content: 'Body',
          anchorLink: null,
          reveal: '',
          review: null,
          createdAt: '',
          updatedAt: ''
        }
      }}
      onGoBack={vi.fn()}
      onGoForward={vi.fn()}
      onGoParent={vi.fn()}
      onNodePriorityChange={vi.fn()}
      onSelectBacklinkNode={vi.fn()}
      onSelectBreadcrumbNode={vi.fn()}
      onToggleSourceUpdatePanel={vi.fn()}
      priorityQuickSetShortcutLabel="Ctrl+M"
      reviewSchedulerSettings={DEFAULT_REVIEW_SCHEDULER_SETTINGS}
      showSourceUpdateAction={false}
    />
  );

  expect(screen.getByRole('button', { name: 'Open link references (1)' })).toBeInTheDocument();
  expect(screen.getByText('1')).toBeInTheDocument();
});
