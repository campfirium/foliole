import { describe, expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { getDocumentPanelView, hasVisibleTitleHeading, shouldReserveTitleSlot } from './documentPanelSectionModel';
import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';

const baseNode: Node = {
  id: 'node-1',
  kind: 'topic',
  title: 'Node 1',
  parentNodeId: null,
  content: '',
  anchorLink: null,
  reveal: '',
  review: null,
  createdAt: '',
  updatedAt: ''
};

function buildProps(overrides: Partial<DocumentPanelSectionProps> = {}): DocumentPanelSectionProps {
  return {
    activeNodeId: 'node-1',
    isWorkspaceHydrated: true,
    isTrashViewOpen: false,
    editableNodeId: 'node-1',
    canGoBack: true,
    canGoForward: true,
    canGoParent: false,
    contextMenu: null,
    editorContent: '# Node 1',
    editorAppearanceKey: 'appearance-1',
    isEditorReadOnly: false,
    editorNodeId: 'node-1',
    showAnswerSection: false,
    onAnswerChange: () => undefined,
    onEditorChange: () => undefined,
    onNodeContentChange: () => undefined,
    onEditorContextMenu: () => undefined,
    onEditorReady: () => undefined,
    onCloseContextMenu: () => undefined,
    onCopyImage: () => undefined,
    onCreateHighlight: () => undefined,
    onCreatePdfHighlight: () => false,
    onCreateCloze: () => undefined,
    onCutImage: () => undefined,
    onDeleteImage: () => undefined,
    onExportImage: () => undefined,
    onGoBack: () => undefined,
    onGoForward: () => undefined,
    onGoParent: () => undefined,
    onSelectBreadcrumbNode: () => undefined,
    onPersistPdfViewState: () => undefined,
    onRevealDocumentPosition: () => undefined,
    onRevealDocumentSelection: () => undefined,
    onResolveDocumentPositionAtViewportY: () => null,
    onSelectNode: () => undefined,
    nodeOrder: ['node-1'],
    trashedNodeIds: [],
    nodesById: { 'node-1': baseNode },
    ...overrides
  };
}

describe('documentPanelSectionModel', () => {
  it('detects only visible first-level headings as title headings', () => {
    expect(hasVisibleTitleHeading('# Node title\nBody', false)).toBe(true);
    expect(hasVisibleTitleHeading('**# Node title**\nBody', false)).toBe(true);
    expect(hasVisibleTitleHeading(' **# Node title**\nBody', false)).toBe(false);
    expect(hasVisibleTitleHeading('Node title\nBody', false)).toBe(false);
    expect(hasVisibleTitleHeading('# Node title\nBody', true)).toBe(false);
  });

  it('reserves title space for cards without a visible title heading', () => {
    expect(getDocumentPanelView(buildProps({ editorContent: 'Body only' }), 'preview', 860).bodyProps.editorContentPaddingTop).toBe('calc(var(--editor-space-xs) + var(--editor-space-md) + 2.485em + var(--editor-space-xs))');
    expect(getDocumentPanelView(buildProps({ editorContent: '# Node 1\nBody' }), 'preview', 860).bodyProps.editorContentPaddingTop).toBeUndefined();
    expect(getDocumentPanelView(buildProps({ editorContent: '**# Node 1**\nBody' }), 'preview', 860).bodyProps.editorContentPaddingTop).toBeUndefined();
  });

  it('reserves title space only for derived cards and top-level topics', () => {
    const inboxNode: Node = { ...baseNode, id: 'special-inbox', kind: 'folder', specialKind: 'inbox' };
    expect(shouldReserveTitleSlot({ ...baseNode, anchorLink: { id: 'a1', kind: 'highlight' } }, {}, 'Body only', false)).toBe(true);
    expect(shouldReserveTitleSlot({ ...baseNode, parentNodeId: null, kind: 'topic' }, {}, 'Body only', false)).toBe(true);
    expect(shouldReserveTitleSlot({ ...baseNode, parentNodeId: 'special-inbox', kind: 'topic' }, { 'special-inbox': inboxNode }, 'Body only', false)).toBe(true);
    expect(shouldReserveTitleSlot({ ...baseNode, parentNodeId: 'book-1', kind: 'topic' }, {}, 'Body only', false)).toBe(false);
  });
});
