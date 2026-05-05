import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('./ReadwiseBookActionsPanel', () => ({
  ReadwiseBookActionsPanel: () => null
}));

const { documentSourceUpdatePanelMock } = vi.hoisted(() => ({
  documentSourceUpdatePanelMock: vi.fn()
}));

vi.mock('./DocumentSourceUpdatePanel', () => ({
  DocumentSourceUpdatePanel: (props: { open: boolean; onCurrentContentChange: (content: string) => void; onOpenChange: (open: boolean) => void }) => {
    documentSourceUpdatePanelMock(props);
    return props.open ? <div data-testid="document-source-update-panel">Source update panel</div> : null;
  }
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

function renderSection() {
  return renderSectionWithProps({});
}

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
      onSelectNode={() => undefined}
      onStartDocumentResize={() => undefined}
      showAnswerSection={false}
      {...overrides}
    />
  );
}

beforeEach(() => {
  documentSourceUpdatePanelMock.mockReset();
  useNodeSourceUpdatePreview.mockReturnValue({
    isLoading: false,
    value: null
  });
});

function mockSourceUpdatePreview() {
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

function openSourceUpdatePanel() {
  const trigger = screen.getAllByRole('button', { name: 'Toggle source update panel' }).at(-1);
  if (!trigger) {
    throw new Error('Expected source update panel trigger');
  }
  fireEvent.click(trigger);
  return documentSourceUpdatePanelMock.mock.calls.at(-1)?.[0];
}

describe('DocumentPanelSection basic views', () => {
  it('hides the source update action when no source update is available', () => {
    renderSection();

    expect(screen.queryByRole('button', { name: 'Toggle source update panel' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(1);
  });

  it('renders the document body without passing a visible kind label', () => {
    renderSection();

    expect(screen.getByText('Document body')).toBeInTheDocument();
  });

  it('shows the folder list shell for ordinary folder nodes', () => {
    renderSectionWithProps({
      activeNodeId: 'node-1',
      editorNodeId: 'node-1',
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        'node-1': { ...baseNode, kind: 'folder', content: 'Folder prose should stay hidden' },
        'node-2': { ...baseNode, id: 'node-2', parentNodeId: 'node-1', title: 'Child topic', content: '# Child topic' }
      }
    });

    expect(screen.getByRole('region', { name: 'Folder list view' })).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
    expect(screen.queryByTestId('document-panel-body')).not.toBeInTheDocument();
  });
});

it('shows the virtual node detail shell with clear empty states', () => {
  renderSectionWithProps({
    activeNodeId: 'node-1',
    editorNodeId: 'node-1',
    nodesById: {
      'node-1': { ...baseNode, kind: 'folder', specialKind: 'virtual', title: 'Saved search' }
    }
  });

  expect(screen.getByRole('region', { name: 'Virtual node details' })).toBeInTheDocument();
  expect(screen.getByText('Saved filter')).toBeInTheDocument();
  expect(screen.getByText('Saved value: none')).toBeInTheDocument();
  expect(screen.getByText('No saved filter yet')).toBeInTheDocument();
  expect(screen.queryByTestId('document-panel-body')).not.toBeInTheDocument();
});

it('reuses the folder list module for virtual node results and opens the original article node', () => {
  const onSelectNode = vi.fn();

  renderSectionWithProps({
    activeNodeId: 'node-1',
    editorNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodesById: {
      'node-1': {
        ...baseNode,
        kind: 'folder',
        specialKind: 'virtual',
        title: 'Saved search',
        virtualFilter: {
          version: 1,
          match: 'all',
          conditions: [{ field: 'text', operator: 'contains', value: 'reader' }]
        }
      },
      'node-2': {
        ...baseNode,
        id: 'node-2',
        title: 'Reader article',
        content: 'A reader note that should appear in the reused list.'
      },
      'node-3': {
        ...baseNode,
        id: 'node-3',
        title: 'Another note',
        content: 'No matching keyword here.'
      }
    },
    onSelectNode
  });

  expect(screen.getByRole('region', { name: 'Folder list view' })).toBeInTheDocument();
  expect(screen.getByTestId('folder-list-title-node-2')).toHaveTextContent('Reader article');
  expect(screen.queryByTestId('folder-list-title-node-3')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Open Reader article' }));

  expect(onSelectNode).toHaveBeenCalledWith('node-2');
});

it('saves the virtual node keyword through the detail form', () => {
  const onNodeContentChange = vi.fn();

  renderSectionWithProps({
    activeNodeId: 'node-1',
    editorNodeId: 'node-1',
    nodesById: {
      'node-1': { ...baseNode, kind: 'folder', specialKind: 'virtual', title: 'Saved search' }
    },
    onNodeContentChange
  });

  fireEvent.change(screen.getByLabelText('Keyword'), { target: { value: 'reader' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save and run' }));

  expect(onNodeContentChange).toHaveBeenCalledWith('node-1', 'reader');
});

describe('DocumentPanelSection source updates', () => {
  it('opens the source update panel from the header action', () => {
    mockSourceUpdatePreview();

    renderSection();

    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(1);
    expect(screen.queryByTestId('document-source-update-panel')).not.toBeInTheDocument();

    openSourceUpdatePanel();

    expect(screen.getByTestId('document-source-update-panel')).toBeInTheDocument();
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(1);
  });

  it('places the source update action before the more-options menu in the header', () => {
    mockSourceUpdatePreview();

    renderSection();

    const splitButton = screen.getAllByRole('button', { name: 'Toggle source update panel' }).at(-1);
    const moreButton = screen.getAllByRole('button', { name: 'More editor options' }).at(-1);

    if (!splitButton || !moreButton) {
      throw new Error('Expected header action buttons');
    }

    expect(splitButton.compareDocumentPosition(moreButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('writes source update panel edits back when the panel closes', () => {
    const onNodeContentChange = vi.fn();
    mockSourceUpdatePreview();

    renderSectionWithProps({ onNodeContentChange });

    const panelProps = openSourceUpdatePanel();
    act(() => {
      panelProps?.onCurrentContentChange('Updated from split panel');
    });
    act(() => {
      panelProps?.onOpenChange(false);
    });

    expect(onNodeContentChange).toHaveBeenCalledWith('node-1', 'Updated from split panel');
  });

  it('does not write back unchanged source update panel content on close', () => {
    const onNodeContentChange = vi.fn();
    mockSourceUpdatePreview();

    renderSectionWithProps({ editorContent: 'Current content', onNodeContentChange });

    const panelProps = openSourceUpdatePanel();
    act(() => {
      panelProps?.onOpenChange(false);
    });

    expect(onNodeContentChange).not.toHaveBeenCalled();
  });
});
