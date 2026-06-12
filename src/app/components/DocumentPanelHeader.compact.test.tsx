import { screen, waitFor } from '@testing-library/react';
import type { CSSProperties } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../features/settings/model/reviewSchedulerSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { DocumentPanelHeader } from './DocumentPanelHeader';

const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
const originalResizeObserver = globalThis.ResizeObserver;

const compactHeaderNodes: Record<string, Node> = {
  'node-1': {
    id: 'node-1',
    kind: 'topic',
    title: 'Inbox',
    parentNodeId: null,
    content: '',
    anchorLink: null,
    reveal: null,
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

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  globalThis.ResizeObserver = originalResizeObserver;
});

function installCompactMeasurement() {
  HTMLElement.prototype.getBoundingClientRect = () => ({
    bottom: 0,
    height: 0,
    left: 0,
    right: 920,
    toJSON: () => ({}),
    top: 0,
    width: 920,
    x: 0,
    y: 0
  });
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  } as typeof ResizeObserver;
}

it('moves navigation and editor menu into the document rail only at the compact threshold', async () => {
  installCompactMeasurement();

  renderWithLocalization(
    <div style={{ '--document-max-width': '760px' } as CSSProperties}>
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
        nodesById={compactHeaderNodes}
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
    </div>
  );

  const rail = screen.getByTestId('document-header-content-rail');
  const compactNavigationAligner = await screen.findByTestId('document-header-compact-navigation-aligner');

  await waitFor(() => {
    expect(rail).toContainElement(screen.getByLabelText('Document navigation actions'));
    expect(rail).toContainElement(screen.getByLabelText('More editor options'));
  });
  expect(compactNavigationAligner.className).not.toMatch(/(?:^|\s)(?:-?ml-|translate-)/);
});
