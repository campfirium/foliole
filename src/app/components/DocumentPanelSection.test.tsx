import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import {
  baseNode,
  buildSectionProps,
  createSectionElement,
  documentPanelBodyMock,
  loadRuntimeNodeBacklinks,
  renderSection,
  renderSectionWithProps
} from './DocumentPanelSection.testSupport';

function expectDocumentBodyLayout(args: {
  editorContentPaddingBottom: string | undefined;
  fitBlockImagesToViewport: boolean;
}) {
  expect(
    documentPanelBodyMock.mock.calls.some(([props]) =>
      props &&
      typeof props === 'object' &&
      'fitBlockImagesToViewport' in props &&
      (props as { editorContentPaddingBottom?: string }).editorContentPaddingBottom === args.editorContentPaddingBottom &&
      (props as { fitBlockImagesToViewport?: boolean }).fitBlockImagesToViewport === args.fitBlockImagesToViewport
    )
  ).toBe(true);
}

function renderMutableBacklinksScenario() {
  const nodesById: Record<string, Node> = {
    'node-1': { ...baseNode, kind: 'topic', content: '# Topic body' },
    'node-2': {
      ...baseNode,
      id: 'node-2',
      title: 'Linked note',
      content: 'No backlink yet.'
    }
  };
  const props = buildSectionProps({
    nodeOrder: ['node-1', 'node-2'],
    nodesById
  });
  const view = render(
    createSectionElement({
      nodeOrder: props.nodeOrder,
      nodesById: props.nodesById
    })
  );

  return { nodesById, props, view };
}

function renderTopicBacklinksView() {
  renderSectionWithProps({
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': { ...baseNode, kind: 'topic', content: '# Topic body' },
      'node-2': {
        ...baseNode,
        id: 'node-2',
        title: 'Linked note',
        content: 'See [[Node 1]] for the follow-up.'
      }
    }
  });
}

function renderRuntimeBacklinksView() {
  loadRuntimeNodeBacklinks.mockResolvedValue([
    {
      sourceNodeId: 'node-2',
      sourceTitle: 'Linked note',
      context: 'See [[Node 1]] for the follow-up.',
      matchCount: 1
    }
  ] as never);

  renderSectionWithProps({
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': { ...baseNode, kind: 'topic', content: '# Topic body' },
      'node-2': {
        ...baseNode,
        id: 'node-2',
        title: 'Linked note',
        content: '',
        hasContent: true
      }
    }
  });
}

describe('DocumentPanelSection primary views', () => {
  it('hides the source update action when no source update is available', () => {
    renderSection();

    expect(screen.queryByRole('button', { name: 'Toggle source update panel' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('document-panel-body')).toHaveLength(1);
  });

  it('renders the document body without passing a visible kind label', () => {
    renderSection();

    expect(screen.getByText('Document body')).toBeInTheDocument();
  });

  it('keeps topic documents renderable when backlinks exist', () => {
    renderTopicBacklinksView();

    expect(screen.getByText('Document body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open link references (1)' })).toBeInTheDocument();
    expectDocumentBodyLayout({
      editorContentPaddingBottom: undefined,
      fitBlockImagesToViewport: false
    });
  });

  it('refreshes backlinks without requiring a node switch when node content mutates in place', () => {
    const { nodesById, props, view } = renderMutableBacklinksScenario();

    expect(screen.queryByRole('button', { name: 'Open link references (1)' })).not.toBeInTheDocument();

    nodesById['node-2']!.content = 'See [[Node 1]] for the follow-up.';
    view.rerender(
      createSectionElement({
        nodeOrder: props.nodeOrder,
        nodesById: props.nodesById
      })
    );

    expect(screen.getByRole('button', { name: 'Open link references (1)' })).toBeInTheDocument();
  });

it('shows backlinks from runtime-backed data even when source documents are trimmed in memory', async () => {
  renderRuntimeBacklinksView();

  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Open link references (1)' })).toBeInTheDocument()
  );
});

});

describe('DocumentPanelSection secondary views', () => {
  it('does not add the extra document tail for item nodes', () => {
    renderSectionWithProps({
      showAnswerSection: true,
      nodesById: {
        'node-1': { ...baseNode, kind: 'item', content: '# Prompt', reveal: 'Answer' }
      }
    });

    expectDocumentBodyLayout({
      editorContentPaddingBottom: undefined,
      fitBlockImagesToViewport: false
    });
    expect(screen.queryByRole('button', { name: /open link references/i })).not.toBeInTheDocument();
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
    expect(screen.getByRole('heading', { level: 2, name: 'Node 1' })).toBeInTheDocument();
    expect(screen.getByTestId('folder-list-count')).toHaveTextContent('1');
    expect(screen.queryByRole('separator', { name: /Resize document width/ })).not.toBeInTheDocument();
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

  expect(screen.getByRole('region', { name: 'Virtual folder details' })).toBeInTheDocument();
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

