import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

import { getEditorDisplayMode } from '../model/editorDisplayMode';
import { getMarkdownSyntaxVisibility } from '../model/markdownSyntaxSetting';

import { buildPreviewAtomicRangeSet, buildPreviewDecorationSet, buildSourceDecorationSet } from './liveMarkdownDecorations';
import { getEditedMathRange, isSameEditedMathRange } from './liveMarkdownMathEditState';
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
    editedMathRange: getEditedMathRange(view.state),
    hideTitleHeading: view.state.facet(hideTitleHeadingFacet),
    imageClozePresentationVersion: view.state.facet(imageClozePresentationVersionFacet),
    markdownSyntaxVisible: getMarkdownSyntaxVisibility() === 'visible',
    onMissingAttachmentResource: view.state.facet(missingAttachmentResourceFacet),
    nodeId: view.state.facet(activeNodeIdFacet)
  });
}

function buildAtomicRanges(view: EditorView): DecorationSet {
  return buildPreviewAtomicRangeSet(view, getEditedMathRange(view.state));
}

export const markdownLinePlugin = ViewPlugin.fromClass(
  class {
    atomicRanges: DecorationSet;
    decorations: DecorationSet;
    cursorLineNumber: number | null;

    constructor(view: EditorView) {
      this.atomicRanges = buildAtomicRanges(view);
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
      const editedMathRangeChanged = !isSameEditedMathRange(
        getEditedMathRange(update.startState),
        getEditedMathRange(update.state)
      );
      const nextCursorLineNumber = getCursorLineNumber(update.view);

      if (
        shouldRefreshLineDecorations(update, this.cursorLineNumber, nextCursorLineNumber) ||
        nodeIdChanged ||
        imageClozePresentationChanged ||
        textAnchorDecorationsChanged ||
        editedMathRangeChanged
      ) {
        this.atomicRanges = buildAtomicRanges(update.view);
        this.decorations = buildLineDecorations(update.view);
      }

      this.cursorLineNumber = nextCursorLineNumber;
    }
  },
  {
    decorations: (value) => value.decorations,
    provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomicRanges ?? Decoration.none)
  }
);
