import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';

import { DocumentPanelSection } from './DocumentPanelSection';

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

export function renderSectionWithProps(overrides: Partial<ComponentProps<typeof DocumentPanelSection>>) {
  return render(
    <DocumentPanelSection
      activeNodeId="node-1"
      canGoBack
      canGoForward
      canGoParent={false}
      contextMenu={null}
      editableNodeId="node-1"
      editorAppearanceKey="appearance-1"
      editorContent="# Node 1"
      isEditorReadOnly={false}
      editorNodeId="node-1"
      editorNodeViewState={undefined}
      nodeOrder={['node-1']}
      nodesById={{ 'node-1': baseNode }}
      onAnswerChange={() => undefined}
      onCloseContextMenu={() => undefined}
      onCopyImage={() => undefined}
      onCreateCloze={() => undefined}
      onCreateHighlight={() => undefined}
      onCreatePdfHighlight={() => false}
      onAdjustExistingHighlightRange={() => true}
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
      onResolveDocumentPositionAtViewportY={() => null}
      onRevealDocumentPosition={() => undefined}
      onRevealDocumentSelection={() => undefined}
      onSelectBreadcrumbNode={() => undefined}
      onSelectNode={() => undefined}
      showAnswerSection={false}
      trashedNodeIds={[]}
      {...overrides}
    />
  );
}
