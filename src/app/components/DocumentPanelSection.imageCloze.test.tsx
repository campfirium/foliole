import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';

import { DocumentPanelSection } from './DocumentPanelSection';

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({
    editorDisplayMode: 'preview' as const,
    toggleEditorDisplayMode: vi.fn()
  })
}));

vi.mock('./DocumentPanelBody', () => ({
  DocumentPanelBody: () => <div data-testid="document-panel-body">Document body</div>
}));

vi.mock('../../features/image-cloze/components/ImageClozeCardView', () => ({
  ImageClozeCardView: () => <div data-testid="image-cloze-card-view">Image cloze card</div>
}));

vi.mock('./ReadwiseBookActionsPanel', () => ({
  ReadwiseBookActionsPanel: () => null
}));

vi.mock('./useNodeSourceUpdatePreview', () => ({
  useNodeSourceUpdatePreview: () => ({
    isLoading: false,
    value: null
  })
}));

const baseNode = {
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

function renderSectionWithProps(overrides: Partial<ComponentProps<typeof DocumentPanelSection>>) {
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
      trashedNodeIds={[]}
      {...overrides}
    />
  );
}

it('renders the image cloze card view for image cloze items', () => {
  renderSectionWithProps({
    activeNodeId: 'node-1',
    editorNodeId: 'node-1',
    nodesById: {
      'node-1': {
        ...baseNode,
        kind: 'item',
        anchorLink: {
          id: 'cloze-1',
          kind: 'cloze',
          locator: {
            attachmentId: 'hash-1',
            height: 0.2,
            width: 0.3,
            x: 0.1,
            y: 0.2
          }
        },
        reveal: 'Paris'
      }
    }
  });

  expect(screen.getByTestId('image-cloze-card-view')).toBeInTheDocument();
  expect(screen.queryByTestId('document-panel-body')).not.toBeInTheDocument();
});
