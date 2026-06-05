import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { DocumentPanelHeader } from './DocumentPanelHeader';

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({
    editorDisplayMode: 'preview' as const,
    toggleEditorDisplayMode: vi.fn()
  })
}));

vi.mock('../../features/nodes/components/NodeBreadcrumbs', () => ({
  NodeBreadcrumbs: ({ onSelectNode }: { onSelectNode: (nodeId: string) => void }) => (
    <button onClick={() => onSelectNode('breadcrumb-target')} type="button">
      trigger breadcrumb
    </button>
  )
}));

it('routes breadcrumb clicks to onSelectBreadcrumbNode', () => {
  const onSelectBreadcrumbNode = vi.fn();

  renderWithLocalization(
    <DocumentPanelHeader
      activeNodeId="node-1"
      backlinks={[]}
      canGoBack={false}
      canGoForward={false}
      canGoParent={false}
      editableNodeId="node-1"
      folderListToolbar={null}
      isFolderListView={false}
      isSourceUpdatePanelOpen={false}
      nodesById={{
        'node-1': {
          id: 'node-1',
          kind: 'topic',
          title: 'A',
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
      onSelectBreadcrumbNode={onSelectBreadcrumbNode}
      onToggleSourceUpdatePanel={vi.fn()}
      priorityQuickSetShortcutLabel="Ctrl+M"
      reviewSchedulerSettings={DEFAULT_REVIEW_SCHEDULER_SETTINGS}
      showSourceUpdateAction={false}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'trigger breadcrumb' }));

  expect(onSelectBreadcrumbNode).toHaveBeenCalledWith('breadcrumb-target');
});
