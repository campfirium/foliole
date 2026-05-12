import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { VIRTUAL_REMOVED_NODE_ID } from '../../features/nodes/model/specialNodes';

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({ editorAppearanceKey: 'default', readingContentWidth: 720 })
}));

vi.mock('./DocumentPanelSection', () => ({
  DocumentPanelSection: () => <div>regular document surface</div>
}));

vi.mock('./RemovedSourcePreviewSurface', () => ({
  RemovedSourcePreviewSurface: () => <div>removed preview surface</div>
}));

import { WorkspaceDocumentSurface } from './WorkspaceDocumentSurface';

function createProps(overrides = {}) {
  return {
    activeVirtualNodeId: null,
    canGoBack: false,
    canGoForward: false,
    documentNodeId: null,
    isExternalViewOpen: false,
    isImmersiveEditing: false,
    isImmersiveMode: false,
    isPriorityQuickSetActive: false,
    isTrashViewOpen: false,
    isVirtualViewOpen: false,
    isWorkspaceHydrated: true,
    onEnterImmersiveEdit: vi.fn(),
    onGoBack: vi.fn(),
    onGoForward: vi.fn(),
    onSelectNode: vi.fn(),
    onShouldSuppressSelectionRestore: vi.fn(),
    ...overrides
  } as unknown as Parameters<typeof WorkspaceDocumentSurface>[0];
}

it('routes the Removed virtual entry to its document preview surface', () => {
  render(
    <WorkspaceDocumentSurface
      {...createProps({ activeVirtualNodeId: VIRTUAL_REMOVED_NODE_ID, isVirtualViewOpen: true })}
    />
  );

  expect(screen.getByText('removed preview surface')).toBeInTheDocument();
  expect(screen.queryByText('regular document surface')).toBeNull();
});
