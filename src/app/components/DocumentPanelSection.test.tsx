import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

const baseNode = {
  id: 'node-1',
  title: 'Node 1',
  parentNodeId: null,
  content: '',
  anchorLink: null,
  reveal: '',
  review: null,
  createdAt: '',
  updatedAt: ''
};

function renderSection() {
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
      editorNodeId="node-1"
      editorNodeViewState={undefined}
      isDocumentResizing={false}
      nodesById={{ 'node-1': baseNode }}
      onAnswerChange={() => undefined}
      onCloseContextMenu={() => undefined}
      onCreateCloze={() => undefined}
      onCreateHighlight={() => undefined}
      onEditorChange={() => undefined}
      onEditorContextMenu={() => undefined}
      onEditorReady={() => undefined}
      onGoBack={() => undefined}
      onGoForward={() => undefined}
      onGoParent={() => undefined}
      onResetLayout={() => undefined}
      onResolveDocumentPositionAtViewportY={() => null}
      onRevealDocumentPosition={() => undefined}
      onRevealDocumentSelection={() => undefined}
      onSelectNode={() => undefined}
      onStartDocumentResize={() => undefined}
      showAnswerSection={false}
    />
  );
}

describe('DocumentPanelSection', () => {
  it('opens and closes the split panel dialog from the new header action', () => {
    renderSection();

    expect(screen.queryByLabelText('Split panel placeholder')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle split panel' }));

    expect(screen.getByRole('dialog', { name: 'Document split panel' })).toBeInTheDocument();
    expect(screen.getByLabelText('Split panel placeholder')).toBeInTheDocument();
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Close split panel' }));

    expect(screen.queryByRole('dialog', { name: 'Document split panel' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Split panel placeholder')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(1);
  });

  it('places the split panel action before the more-options menu in the header', () => {
    renderSection();

    const splitButton = screen.getByRole('button', { name: 'Toggle split panel' });
    const moreButton = screen.getByRole('button', { name: 'More editor options' });

    expect(splitButton.compareDocumentPosition(moreButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
