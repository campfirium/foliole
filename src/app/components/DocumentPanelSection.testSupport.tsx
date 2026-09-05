import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, vi } from 'vitest';

import '../../test/reactPdfMock';

import { MouseGestureSettingsProvider } from '../../features/settings/context/MouseGestureSettingsProvider';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';
import type { loadRuntimeNodeSourceDetails as loadRuntimeNodeSourceDetailsRuntime } from '../../shared/platform/nodeSourceRuntimeRepository';

import { requestDocumentComparisonViewToggle, requestSourceUpdateReview } from './documentComparisonView';
import { DocumentPanelSection } from './DocumentPanelSection';

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({
    editorDisplayMode: 'preview' as const,
    immersiveDoubleClickEditEnabled: true,
    toggleEditorDisplayMode: vi.fn()
  })
}));

const documentPanelBodyMocks = vi.hoisted(() => ({
  documentPanelBodyMock: vi.fn()
}));
export const documentPanelBodyMock = documentPanelBodyMocks.documentPanelBodyMock;

vi.mock('./DocumentPanelBody', () => ({
  DocumentPanelBody: (props: unknown) => {
    documentPanelBodyMock(props);
    return <div data-testid="document-panel-body">Document body</div>;
  }
}));

vi.mock('./ReadwiseBookActionsPanel', () => ({
  ReadwiseBookActionsPanel: () => null
}));

const documentSourceUpdatePanelMocks = vi.hoisted(() => ({
  documentSourceUpdatePanelMock: vi.fn()
}));
export const documentSourceUpdatePanelMock = documentSourceUpdatePanelMocks.documentSourceUpdatePanelMock;

export function getLatestComparisonPanelProps() {
  return documentSourceUpdatePanelMock.mock.calls.at(-1)?.[0];
}

vi.mock('./DocumentSourceUpdatePanel', () => ({
  DocumentSourceUpdatePanel: (props: {
    comparisonMode: 'manual' | 'source_preview' | 'incoming_update' | 'sync_alternative';
    comparisonSource: 'manual' | 'source';
    manualContent: string;
    onAcceptIncomingUpdate?: () => Promise<void>;
    onCurrentContentChange: (content: string) => void;
    onDismissIncomingUpdate?: () => Promise<void>;
    onImportIncomingUpdateAsNew?: () => Promise<void>;
    onManualContentChange: (content: string) => void;
    onManualSaveAsTopic: () => Promise<void>;
    onManualSetAsBody: () => Promise<void>;
    onOpenChange: (open: boolean) => void;
    onSourceChange: (source: 'manual' | 'source') => void;
    open: boolean;
    sourceAvailable: boolean;
  }) => {
    documentSourceUpdatePanelMock(props);
    return props.open ? <div data-testid="document-source-update-panel">Source update panel</div> : null;
  }
}));

const nodeSourceRuntimeRepositoryMocks = vi.hoisted(() => ({
  acceptRuntimeIncomingUpdate: vi.fn(),
  dismissRuntimeIncomingUpdate: vi.fn(),
  importRuntimeIncomingUpdateAsNew: vi.fn(),
  loadRuntimeNodeSourceDetails: vi.fn<typeof loadRuntimeNodeSourceDetailsRuntime>(async () => null)
}));
export const acceptRuntimeIncomingUpdate = nodeSourceRuntimeRepositoryMocks.acceptRuntimeIncomingUpdate;
export const dismissRuntimeIncomingUpdate = nodeSourceRuntimeRepositoryMocks.dismissRuntimeIncomingUpdate;
export const importRuntimeIncomingUpdateAsNew = nodeSourceRuntimeRepositoryMocks.importRuntimeIncomingUpdateAsNew;
export const loadRuntimeNodeSourceDetails = nodeSourceRuntimeRepositoryMocks.loadRuntimeNodeSourceDetails;

vi.mock('../../shared/platform/nodeSourceRuntimeRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/platform/nodeSourceRuntimeRepository')>()),
  acceptRuntimeIncomingUpdate: nodeSourceRuntimeRepositoryMocks.acceptRuntimeIncomingUpdate,
  dismissRuntimeIncomingUpdate: nodeSourceRuntimeRepositoryMocks.dismissRuntimeIncomingUpdate,
  importRuntimeIncomingUpdateAsNew: nodeSourceRuntimeRepositoryMocks.importRuntimeIncomingUpdateAsNew,
  loadRuntimeNodeSourceDetails: nodeSourceRuntimeRepositoryMocks.loadRuntimeNodeSourceDetails
}));

const sourceUpdatePreviewMocks = vi.hoisted(() => ({
  useNodeSourceUpdatePreview: vi.fn(() => ({
    isLoading: false,
    value: null
  }))
}));
const useNodeSourceUpdatePreview = sourceUpdatePreviewMocks.useNodeSourceUpdatePreview;

vi.mock('./useNodeSourceUpdatePreview', () => ({
  useNodeSourceUpdatePreview: sourceUpdatePreviewMocks.useNodeSourceUpdatePreview
}));

const nodeBacklinksBridgeMocks = vi.hoisted(() => ({
  loadRuntimeNodeBacklinks: vi.fn(() => null)
}));
export const loadRuntimeNodeBacklinks = nodeBacklinksBridgeMocks.loadRuntimeNodeBacklinks;

vi.mock('../../shared/platform/nodeBacklinksRuntimeRepository', () => ({
  loadRuntimeNodeBacklinks: nodeBacklinksBridgeMocks.loadRuntimeNodeBacklinks
}));

const workspaceNodePreparationMocks = vi.hoisted(() => ({
  ensureWorkspaceNodeDocumentReady: vi.fn(() => null)
}));
export const ensureWorkspaceNodeDocumentReady = workspaceNodePreparationMocks.ensureWorkspaceNodeDocumentReady;

vi.mock('../../store/workspaceNodePreparation', () => ({
  ensureWorkspaceNodeDocumentReady: workspaceNodePreparationMocks.ensureWorkspaceNodeDocumentReady
}));

export const baseNode = {
  id: 'node-1',
  kind: 'topic' as const,
  title: 'Node 1',
  parentNodeId: null,
  content: '# Node 1',
  bodyStatus: 'ready' as const,
  hasContent: true,
  hasReveal: false,
  anchorLink: null,
  reveal: '',
  review: null,
  createdAt: '',
  updatedAt: ''
};

export function renderSection() {
  return renderSectionWithProps({});
}

export function buildSectionProps(overrides: Partial<ComponentProps<typeof DocumentPanelSection>> = {}) {
  return {
    activeNodeId: 'node-1',
    isWorkspaceHydrated: true,
    isTrashViewOpen: false,
    canGoBack: true,
    canGoForward: true,
    canGoParent: false,
    contextMenu: null,
    editableNodeId: 'node-1',
    editorAppearanceKey: 'appearance-1',
    editorContent: '# Node 1',
    isEditorReadOnly: false,
    isImmersiveEditing: false,
    isImmersiveMode: false,
    onEnterImmersiveEdit: () => undefined,
    editorNodeId: 'node-1',
    nodeOrder: ['node-1'],
    trashedNodeIds: [],
    nodesById: { 'node-1': baseNode },
    onAnswerChange: () => undefined,
    onCloseContextMenu: () => undefined,
    onCopyImage: () => undefined,
    onCreateCloze: () => undefined,
    onCreateHighlight: () => undefined,
    onCreatePdfHighlight: () => false,
    onAdjustExistingHighlightRange: () => true,
    onRepairTable: () => false,
    onCutImage: () => undefined,
    onDeleteImage: () => undefined,
    onEditorChange: () => undefined,
    onNodeContentChange: () => undefined,
    onEditorContextMenu: () => undefined,
    onEditorReady: () => undefined,
    onExportImage: () => undefined,
    onGoBack: () => undefined,
    onGoForward: () => undefined,
    onGoParent: () => undefined,
    onPersistPdfViewState: () => undefined,
    onResolveDocumentPositionAtViewportY: () => null,
    onRevealDocumentPosition: () => undefined,
    onRevealDocumentSelection: () => undefined,
    onRunDocumentCommand: (commandId: string) => {
      if (commandId === APP_COMMAND_IDS.toggleComparisonView) requestDocumentComparisonViewToggle();
      if (commandId === APP_COMMAND_IDS.reviewSourceUpdate) requestSourceUpdateReview();
    },
    onSelectBreadcrumbNode: () => undefined,
    onSelectNode: () => undefined,
    onSelectNodeInVirtualView: () => undefined,
    showAnswerSection: false,
    ...overrides
  } satisfies ComponentProps<typeof DocumentPanelSection>;
}

export function createSectionElement(overrides: Partial<ComponentProps<typeof DocumentPanelSection>> = {}) {
  return (
    <LocalizationProvider>
      <MouseGestureSettingsProvider>
        <DocumentPanelSection {...buildSectionProps(overrides)} />
      </MouseGestureSettingsProvider>
    </LocalizationProvider>
  );
}

export function renderSectionWithProps(overrides: Partial<ComponentProps<typeof DocumentPanelSection>>) {
  return render(createSectionElement(overrides));
}

export function mockSourceUpdatePreview() {
  useNodeSourceUpdatePreview.mockReturnValue({
    isLoading: false,
    value: {
      checkedAt: '2026-03-28T04:00:00.000Z',
      currentHighlightCount: 1,
      currentContent: 'Current content',
      kind: 'source_update',
      sourceNodeId: 'node-1',
      updatedHighlightCount: 2,
      updatedContent: 'Updated content'
    }
  } as never);
}

export function mockIncomingUpdatePreview() {
  useNodeSourceUpdatePreview.mockReturnValue({
    isLoading: false,
    value: {
      checkedAt: '2026-03-28T04:00:00.000Z',
      currentHighlightCount: 0,
      currentContent: 'Current content',
      incomingUpdateId: 'incoming-update-1',
      kind: 'incoming_update',
      sourceNodeId: 'node-1',
      updatedHighlightCount: 0,
      updatedContent: 'Incoming content'
    }
  } as never);
}

export function mockNoSourceUpdatePreview() {
  useNodeSourceUpdatePreview.mockReturnValue({ isLoading: false, value: null });
}

export function openSourceUpdatePanel() {
  act(() => requestDocumentComparisonViewToggle());
  return documentSourceUpdatePanelMock.mock.calls.at(-1)?.[0];
}

export function openSourceUpdateReview() {
  const trigger = screen.getByRole('button', { name: 'Review Source Update' });
  fireEvent.click(trigger);
  return documentSourceUpdatePanelMock.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  documentSourceUpdatePanelMock.mockReset();
  documentPanelBodyMock.mockReset();
  loadRuntimeNodeBacklinks.mockReset();
  loadRuntimeNodeBacklinks.mockResolvedValue(null);
  ensureWorkspaceNodeDocumentReady.mockReset();
  ensureWorkspaceNodeDocumentReady.mockResolvedValue(null);
  acceptRuntimeIncomingUpdate.mockReset();
  acceptRuntimeIncomingUpdate.mockResolvedValue({ incomingUpdateId: 'incoming-update-1', nodeId: 'node-1', status: 'accepted' });
  dismissRuntimeIncomingUpdate.mockReset();
  dismissRuntimeIncomingUpdate.mockResolvedValue({ incomingUpdateId: 'incoming-update-1', nodeId: 'node-1', status: 'dismissed' });
  importRuntimeIncomingUpdateAsNew.mockReset();
  importRuntimeIncomingUpdateAsNew.mockResolvedValue({ incomingUpdateId: 'incoming-update-1', nodeId: 'node-2', status: 'imported_as_new' });
  loadRuntimeNodeSourceDetails.mockReset();
  loadRuntimeNodeSourceDetails.mockResolvedValue(null);
  useNodeSourceUpdatePreview.mockReturnValue({
    isLoading: false,
    value: null
  });
});
