import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

import { getEditorDisplayMode } from '../model/editorDisplayMode';
import { folioleMarkdownParser } from '../model/folioleMarkdownParser';
import { getMarkdownSyntaxVisibility } from '../model/markdownSyntaxSetting';

import { buildPreviewAtomicRangeSet } from './liveMarkdownAtomicRanges';
import { buildPreviewDecorationSet, buildSourceDecorationSet, type PreviewMarkdownParse } from './liveMarkdownDecorations';
import { getEditedMathRange, isSameEditedMathRange } from './liveMarkdownMathEditState';
import {
  activeNodeIdFacet,
  hideTitleHeadingFacet,
  imageClozePresentationVersionFacet,
  localDocumentPathFacet,
  missingAttachmentResourceFacet,
  textAnchorDecorationsFacet
} from './liveMarkdownState';
import { shouldRefreshLineDecorations } from './liveMarkdownViewport';

function getCursorLineNumber(view: EditorView) {
  if (!view.hasFocus) return null;
  const cursor = view.state.selection.main.head;
  return view.state.doc.lineAt(cursor).number;
}

function parsePreviewMarkdown(view: EditorView): PreviewMarkdownParse {
  const source = view.state.doc.toString();
  return { markdownTree: folioleMarkdownParser.parse(source), source };
}

function buildLineDecorations(view: EditorView, parsedPreviewMarkdown: PreviewMarkdownParse): DecorationSet {
  if (getEditorDisplayMode() === 'source') return buildSourceDecorationSet(view);

  return buildPreviewDecorationSet(view, parsedPreviewMarkdown, {
    activePosition: view.hasFocus ? view.state.selection.main.head : null,
    cursorLineNumber: getCursorLineNumber(view),
    editedMathRange: getEditedMathRange(view.state),
    hideTitleHeading: view.state.facet(hideTitleHeadingFacet),
    imageClozePresentationVersion: view.state.facet(imageClozePresentationVersionFacet),
    localDocumentPath: view.state.facet(localDocumentPathFacet),
    markdownSyntaxVisible: getMarkdownSyntaxVisibility() === 'visible',
    onMissingAttachmentResource: view.state.facet(missingAttachmentResourceFacet),
    nodeId: view.state.facet(activeNodeIdFacet)
  });
}

function buildAtomicRanges(view: EditorView, parsedPreviewMarkdown: PreviewMarkdownParse): DecorationSet {
  return buildPreviewAtomicRangeSet(parsedPreviewMarkdown, getEditedMathRange(view.state));
}

export function shouldReparsePreviewMarkdown(update: Pick<ViewUpdate, 'docChanged'>) {
  return update.docChanged;
}

export const markdownLinePlugin = ViewPlugin.fromClass(
  class {
    atomicRanges: DecorationSet;
    decorations: DecorationSet;
    cursorLineNumber: number | null;
    parsedPreviewMarkdown: PreviewMarkdownParse;

    constructor(view: EditorView) {
      this.parsedPreviewMarkdown = parsePreviewMarkdown(view);
      this.atomicRanges = buildAtomicRanges(view, this.parsedPreviewMarkdown);
      this.cursorLineNumber = getCursorLineNumber(view);
      this.decorations = buildLineDecorations(view, this.parsedPreviewMarkdown);
    }

    update(update: ViewUpdate) {
      const nodeIdChanged =
        update.startState.facet(activeNodeIdFacet) !== update.state.facet(activeNodeIdFacet);
      const localDocumentPathChanged =
        update.startState.facet(localDocumentPathFacet) !== update.state.facet(localDocumentPathFacet);
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
        localDocumentPathChanged ||
        imageClozePresentationChanged ||
        textAnchorDecorationsChanged ||
        editedMathRangeChanged
      ) {
        if (shouldReparsePreviewMarkdown(update)) {
          this.parsedPreviewMarkdown = parsePreviewMarkdown(update.view);
        }
        this.atomicRanges = buildAtomicRanges(update.view, this.parsedPreviewMarkdown);
        this.decorations = buildLineDecorations(update.view, this.parsedPreviewMarkdown);
      }

      this.cursorLineNumber = nextCursorLineNumber;
    }
  },
  {
    decorations: (value) => value.decorations,
    provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomicRanges ?? Decoration.none)
  }
);
