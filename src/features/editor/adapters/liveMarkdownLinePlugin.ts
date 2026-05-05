import { type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

import { getEditorDisplayMode } from '../model/editorDisplayMode';
import { getMarkdownSyntaxVisibility } from '../model/markdownSyntaxSetting';

import { buildPreviewDecorationSet, buildSourceDecorationSet } from './liveMarkdownDecorations';
import {
  activeNodeIdFacet,
  hideTitleHeadingFacet,
  imageClozePresentationVersionFacet,
  missingAttachmentResourceFacet,
  textAnchorDecorationsFacet
} from './liveMarkdownState';
import { shouldRefreshLineDecorations } from './liveMarkdownViewport';

function getCursorLineNumber(view: EditorView) {
  if (!view.hasFocus) return null;
  const cursor = view.state.selection.main.head;
  return view.state.doc.lineAt(cursor).number;
}

function buildLineDecorations(view: EditorView): DecorationSet {
  if (getEditorDisplayMode() === 'source') return buildSourceDecorationSet(view);

  return buildPreviewDecorationSet(view, {
    activePosition: view.hasFocus ? view.state.selection.main.head : null,
    cursorLineNumber: getCursorLineNumber(view),
    hideTitleHeading: view.state.facet(hideTitleHeadingFacet),
    imageClozePresentationVersion: view.state.facet(imageClozePresentationVersionFacet),
    markdownSyntaxVisible: getMarkdownSyntaxVisibility() === 'visible',
    onMissingAttachmentResource: view.state.facet(missingAttachmentResourceFacet),
    nodeId: view.state.facet(activeNodeIdFacet)
  });
}

export const markdownLinePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    cursorLineNumber: number | null;

    constructor(view: EditorView) {
      this.cursorLineNumber = getCursorLineNumber(view);
      this.decorations = buildLineDecorations(view);
    }

    update(update: ViewUpdate) {
      const nodeIdChanged =
        update.startState.facet(activeNodeIdFacet) !== update.state.facet(activeNodeIdFacet);
      const imageClozePresentationChanged =
        update.startState.facet(imageClozePresentationVersionFacet) !==
        update.state.facet(imageClozePresentationVersionFacet);
      const textAnchorDecorationsChanged =
        update.startState.facet(textAnchorDecorationsFacet) !== update.state.facet(textAnchorDecorationsFacet);
      const nextCursorLineNumber = getCursorLineNumber(update.view);

      if (
        shouldRefreshLineDecorations(update, this.cursorLineNumber, nextCursorLineNumber) ||
        nodeIdChanged ||
        imageClozePresentationChanged ||
        textAnchorDecorationsChanged
      ) {
        this.decorations = buildLineDecorations(update.view);
      }

      this.cursorLineNumber = nextCursorLineNumber;
    }
  },
  { decorations: (value) => value.decorations }
);
