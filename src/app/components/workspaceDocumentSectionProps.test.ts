import { expect, it, vi } from 'vitest';

import { buildDocumentSectionProps } from './workspaceDocumentSectionProps';
import type { WorkspaceDocumentSurfaceProps } from './workspaceDocumentSurfaceProps';

function createCoreSurfaceProps() {
  return {
    activeVirtualNodeId: null,
    canGoBack: false,
    canGoForward: false,
    canGoParent: false,
    contextMenu: null,
    documentNodeId: 'node-1',
    editorAdapterRef: { current: null },
    editorContent: 'Body',
    editorNodeId: 'node-1',
    editorNodeViewState: { scrollTop: 0, selection: null },
    externalEntriesByFolderId: {},
    externalFolders: [],
    externalSelection: { folderId: null, entryId: null },
    getReadingPositionRestoreCommand: () => null,
    getReadingPositionSelection: () => ({ from: 240, to: 240 }),
    getReadingPositionSyncState: () => null,
    getReadingPositionTargetViewportMode: () => null,
    getReadingPositionTargetViewportRatio: () => null,
    isEditorReadOnly: false,
    isExternalViewOpen: false,
    isImmersiveEditing: false,
    isImmersiveMode: false,
    isPriorityQuickSetActive: false,
    isTrashViewOpen: false,
    isVirtualViewOpen: false,
    isWorkspaceHydrated: true,
    nodeOrder: ['node-1'],
    nodesById: {},
    nodeViewById: {}
  };
}

function createSurfaceActionProps() {
  return {
    onAnswerChange: vi.fn(),
    onCloseContextMenu: vi.fn(),
    onCopyImage: vi.fn(),
    onCreateCloze: vi.fn(),
    onCreateHighlight: vi.fn(),
    onCreatePdfHighlight: vi.fn(),
    onCutImage: vi.fn(),
    onDeleteImage: vi.fn(),
    onAdjustExistingHighlightRange: vi.fn(() => true),
    onEditorChange: vi.fn(),
    onEditorContextMenu: vi.fn(),
    onEditorReady: vi.fn(),
    onEnterImmersiveEdit: vi.fn(),
    onEnterPriorityQuickSet: vi.fn(),
    onExportImage: vi.fn(),
    onGoBack: vi.fn(),
    onGoForward: vi.fn(),
    onGoParent: vi.fn(),
    onNodeContentChange: vi.fn(),
    onNodeDesiredRetentionChange: vi.fn(),
    onNodePriorityChange: vi.fn(),
    onOpenExternalLibrarySettings: vi.fn(),
    onOpenExternalSelection: vi.fn(),
    onOpenExternalView: vi.fn(),
    onOpenMoveToNode: vi.fn(),
    onPersistPdfViewState: vi.fn(),
    onRegisterEditorDraftFlush: vi.fn(),
    onResolveDocumentPositionAtViewportY: vi.fn(() => null),
    onRevealAnchorInDocument: vi.fn(),
    onRevealDocumentPosition: vi.fn(),
    onRevealDocumentSelection: vi.fn(),
    onSelectBreadcrumbNode: vi.fn(),
    onSelectNode: vi.fn(),
    onSetReadingPositionSelection: vi.fn(),
    onShouldSuppressSelectionRestore: vi.fn(() => false),
    priorityQuickSetShortcutLabel: '',
    reviewSchedulerSettings: {} as never,
    setNodeViewState: vi.fn(),
    setReadingPositionSelection: vi.fn(),
    showAnswerSection: false,
    trashedNodeIds: []
  };
}

function createSurfaceProps(
  overrides: Partial<WorkspaceDocumentSurfaceProps> = {}
): WorkspaceDocumentSurfaceProps {
  return {
    ...createCoreSurfaceProps(),
    ...createSurfaceActionProps(),
    ...overrides
  } as unknown as WorkspaceDocumentSurfaceProps;
}

it('does not pass progress-only reading selection as an editor restore target', () => {
  const sectionProps = buildDocumentSectionProps('node-1', 'appearance', false, () => false, createSurfaceProps());

  expect(sectionProps.editorReadingRestoreCommandId).toBeNull();
  expect(sectionProps.editorReadingSelection).toBeNull();
});

it('passes only explicit restore commands to the editor restore target', () => {
  const sectionProps = buildDocumentSectionProps(
    'node-1',
    'appearance',
    false,
    () => false,
    createSurfaceProps({
      getReadingPositionRestoreCommand: () => ({
        commandId: 'restore-1',
        nodeId: 'node-1',
        reason: 'node-navigation',
        scrollTop: 6400,
        selection: { from: 320, to: 320 },
        startedAt: 1,
        targetViewportRatio: 0.24
      })
    })
  );

  expect(sectionProps.editorReadingRestoreCommandId).toBe('restore-1');
  expect(sectionProps.editorReadingRestoreScrollTop).toBe(6400);
  expect(sectionProps.editorReadingSelection).toEqual({ from: 320, to: 320 });
  expect(sectionProps.editorReadingTargetViewportRatio).toBe(0.24);
});

it('passes existing highlight range adjustment through to the document section', () => {
  const onAdjustExistingHighlightRange = vi.fn(() => true);
  const sectionProps = buildDocumentSectionProps(
    'node-1',
    'appearance',
    false,
    () => false,
    createSurfaceProps({ onAdjustExistingHighlightRange })
  );

  expect(sectionProps.onAdjustExistingHighlightRange).toBe(onAdjustExistingHighlightRange);
});
