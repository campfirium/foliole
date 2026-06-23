import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { DocumentPanelHeader } from './DocumentPanelHeader';

const documentHeaderNodes: Record<string, Node> = {
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
};

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({
    editorDisplayMode: 'preview' as const,
    toggleEditorDisplayMode: vi.fn()
  })
}));

it('shows the breadcrumb title without a kind label in the document header', () => {
  renderWithLocalization(
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
      nodesById={documentHeaderNodes}
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

it('keeps navigation, breadcrumb, and priority controls on the document content rail', () => {
  renderWithLocalization(
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
      nodesById={documentHeaderNodes}
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
  const breadcrumbAligner = screen.getByTestId('document-header-breadcrumb-aligner');
  expect(rail.closest('header')).toHaveClass('min-h-8');
  expect(rail.closest('header')?.className).not.toMatch(/(?:^|\s)(?:px-|pl-|pr-)/);
  expect(rail).toHaveClass('max-w-[var(--document-max-width)]');
  expect(rail).toHaveClass('px-[var(--document-content-inline-padding)]');
  expect(rail).toHaveClass('grid-cols-[auto_minmax(0,1fr)_auto]');
  expect(rail.parentElement).toHaveClass('[container-type:inline-size]');
  expect(screen.getAllByLabelText('Document navigation actions')).toHaveLength(1);
  expect(rail).toContainElement(screen.getByLabelText('Document navigation actions'));
  expect(rail).toContainElement(screen.getByRole('button', { name: 'Inbox' }));
  expect(breadcrumbAligner.className).not.toMatch(/(?:^|\s)(?:pl-|ml-|translate-)/);
  expect(rail).toContainElement(screen.getByRole('button', { name: /Priority P5 from the default fallback/i }));
});

it('keeps the folder-mode header free of document controls', () => {
  renderWithLocalization(
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
  renderWithLocalization(
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
