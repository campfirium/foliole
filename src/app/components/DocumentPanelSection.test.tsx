import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const { useNodeSourceUpdatePreview } = vi.hoisted(() => ({
  useNodeSourceUpdatePreview: vi.fn(() => ({
    isLoading: false,
    value: null
  }))
}));

vi.mock('./useNodeSourceUpdatePreview', () => ({
  useNodeSourceUpdatePreview
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

beforeEach(() => {
  useNodeSourceUpdatePreview.mockReturnValue({
    isLoading: false,
    value: null
  });
});

describe('DocumentPanelSection', () => {
  it('hides the source update action when no source update is available', () => {
    renderSection();

    expect(screen.queryByRole('button', { name: 'Toggle source update panel' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(1);
  });

  it('opens and closes the source update panel from the header action', () => {
    useNodeSourceUpdatePreview.mockReturnValue({
      isLoading: false,
      value: {
        checkedAt: '2026-03-28T10:00:00.000Z',
        currentContent: '# Current',
        sourceNodeId: 'node-1',
        updatedContent: '# Updated'
      } as never
    });

    renderSection();

    expect(screen.queryByRole('dialog', { name: 'Source update panel' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle source update panel' }));

    expect(screen.getByRole('dialog', { name: 'Source update panel' })).toBeInTheDocument();
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Close source update panel' }));

    expect(screen.queryByRole('dialog', { name: 'Source update panel' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(1);
  });

  it('places the source update action before the more-options menu in the header', () => {
    useNodeSourceUpdatePreview.mockReturnValue({
      isLoading: false,
      value: {
        checkedAt: '2026-03-28T10:00:00.000Z',
        currentContent: '# Current',
        sourceNodeId: 'node-1',
        updatedContent: '# Updated'
      } as never
    });

    renderSection();

    const splitButton = screen.getByRole('button', { name: 'Toggle source update panel' });
    const moreButton = screen.getByRole('button', { name: 'More editor options' });

    expect(splitButton.compareDocumentPosition(moreButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
