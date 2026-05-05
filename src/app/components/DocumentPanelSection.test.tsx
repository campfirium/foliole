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
    hasSourceUpdate: false,
    isLoading: false,
    openSourceFile: vi.fn(),
    sourceFilePath: null
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
      isEditorReadOnly={false}
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
    hasSourceUpdate: false,
    isLoading: false,
    openSourceFile: vi.fn(),
    sourceFilePath: null
  });
});

describe('DocumentPanelSection', () => {
  it('hides the source update action when no source update is available', () => {
    renderSection();

    expect(screen.queryByRole('button', { name: 'Open updated source file' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(1);
  });

  it('opens the updated source file from the header action', () => {
    const openSourceFile = vi.fn();
    useNodeSourceUpdatePreview.mockReturnValue({
      hasSourceUpdate: true,
      isLoading: false,
      openSourceFile,
      sourceFilePath: '/tmp/source.md'
    } as never);

    renderSection();

    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open updated source file' }));

    expect(openSourceFile).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(1);
  });

  it('places the source update action before the more-options menu in the header', () => {
    useNodeSourceUpdatePreview.mockReturnValue({
      hasSourceUpdate: true,
      isLoading: false,
      openSourceFile: vi.fn(),
      sourceFilePath: '/tmp/source.md'
    } as never);

    renderSection();

    const splitButton = screen.getByRole('button', { name: 'Open updated source file' });
    const moreButton = screen.getByRole('button', { name: 'More editor options' });

    expect(splitButton.compareDocumentPosition(moreButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
