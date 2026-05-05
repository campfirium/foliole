import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, vi } from 'vitest';

import '../../test/reactPdfMock';

import { DocumentPanelSection } from './DocumentPanelSection';

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({
    editorDisplayMode: 'preview' as const,
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

vi.mock('./DocumentSourceUpdatePanel', () => ({
  DocumentSourceUpdatePanel: (props: { open: boolean; onCurrentContentChange: (content: string) => void; onOpenChange: (open: boolean) => void }) => {
    documentSourceUpdatePanelMock(props);
    return props.open ? <div data-testid="document-source-update-panel">Source update panel</div> : null;
  }
}));

const sourceUpdatePreviewMocks = vi.hoisted(() => ({
  useNodeSourceUpdatePreview: vi.fn(() => ({
    isLoading: false,
    value: null
  }))
}));
export const useNodeSourceUpdatePreview = sourceUpdatePreviewMocks.useNodeSourceUpdatePreview;

vi.mock('./useNodeSourceUpdatePreview', () => ({
  useNodeSourceUpdatePreview: sourceUpdatePreviewMocks.useNodeSourceUpdatePreview
}));

export const baseNode = {
  id: 'node-1',
  kind: 'topic' as const,
  title: 'Node 1',
  parentNodeId: null,
  content: '',
  anchorLink: null,
  reveal: '',
  review: null,
  createdAt: '',
  updatedAt: ''
};

export function renderSection() {
  return renderSectionWithProps({});
}

export function renderSectionWithProps(overrides: Partial<ComponentProps<typeof DocumentPanelSection>>) {
  return render(
    <DocumentPanelSection
      activeNodeId="node-1"
      canGoBack
      canGoForward
      canGoParent={false}
      contextMenu={null}
      documentMaxWidth={760}
      editableNodeId="node-1"
      editorAppearanceKey="appearance-1"
      editorContent="# Node 1"
      isEditorReadOnly={false}
      editorNodeId="node-1"
      editorNodeViewState={undefined}
      isDocumentResizing={false}
      nodeOrder={['node-1']}
      trashedNodeIds={[]}
      nodesById={{ 'node-1': baseNode }}
      onAnswerChange={() => undefined}
      onCloseContextMenu={() => undefined}
      onCopyImage={() => undefined}
      onCreateCloze={() => undefined}
      onCreateHighlight={() => undefined}
      onCreatePdfHighlight={() => false}
      onCutImage={() => undefined}
      onDeleteImage={() => undefined}
      onEditorChange={() => undefined}
      onNodeContentChange={() => undefined}
      onEditorContextMenu={() => undefined}
      onEditorReady={() => undefined}
      onExportImage={() => undefined}
      onGoBack={() => undefined}
      onGoForward={() => undefined}
      onGoParent={() => undefined}
      onPersistPdfViewState={() => undefined}
      onResetLayout={() => undefined}
      onResolveDocumentPositionAtViewportY={() => null}
      onRevealDocumentPosition={() => undefined}
      onRevealDocumentSelection={() => undefined}
      onSelectBreadcrumbNode={() => undefined}
      onSelectNode={() => undefined}
      onStartDocumentResize={() => undefined}
      showAnswerSection={false}
      {...overrides}
    />
  );
}

export function mockSourceUpdatePreview() {
  useNodeSourceUpdatePreview.mockReturnValue({
    isLoading: false,
    value: {
      checkedAt: '2026-03-28T04:00:00.000Z',
      currentContent: 'Current content',
      sourceNodeId: 'node-1',
      updatedContent: 'Updated content'
    }
  } as never);
}

export function openSourceUpdatePanel() {
  const trigger = screen.getAllByRole('button', { name: 'Toggle source update panel' }).at(-1);
  if (!trigger) {
    throw new Error('Expected source update panel trigger');
  }
  fireEvent.click(trigger);
  return documentSourceUpdatePanelMock.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  documentSourceUpdatePanelMock.mockReset();
  documentPanelBodyMock.mockReset();
  useNodeSourceUpdatePreview.mockReturnValue({
    isLoading: false,
    value: null
  });
});
