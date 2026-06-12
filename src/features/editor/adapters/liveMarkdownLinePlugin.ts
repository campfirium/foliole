import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

import { logEditorInputDiagnostic, readEditorInputDiagnosticTime } from '../../../store/workspaceEditorInputDiagnostics';
import { getEditorDisplayMode } from '../model/editorDisplayMode';
import { getMarkdownSyntaxVisibility } from '../model/markdownSyntaxSetting';

import { readVisibleMarkdownSyntaxTree } from './codeMirrorMarkdownSyntaxTree';
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

const MARKDOWN_DECORATION_CONTEXT_PATTERN = /[\\`*_{}\[\]()#+\-.!|<>]/;

function getCursorLineNumber(view: EditorView) {
  if (!view.hasFocus) return null;
  const cursor = view.state.selection.main.head;
  return view.state.doc.lineAt(cursor).number;
}

function parsePreviewMarkdown(view: EditorView): PreviewMarkdownParse {
  const startedAt = readEditorInputDiagnosticTime();
  const source = view.state.doc.toString();
  const markdownTree = readVisibleMarkdownSyntaxTree(view);
  logEditorInputDiagnostic('live-markdown-parse', {
    sourceLength: source.length,
    totalMs: readEditorInputDiagnosticTime() - startedAt
  });
  return { markdownTree, source };
}

function buildLineDecorations(view: EditorView, parsedPreviewMarkdown: PreviewMarkdownParse): DecorationSet {
  const startedAt = readEditorInputDiagnosticTime();
  const decorations = getEditorDisplayMode() === 'source'
    ? buildSourceDecorationSet(view)
    : buildPreviewDecorationSet(view, parsedPreviewMarkdown, {
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
  logEditorInputDiagnostic('live-markdown-decorations', {
    totalMs: readEditorInputDiagnosticTime() - startedAt
  });
  return decorations;
}

function buildAtomicRanges(view: EditorView, parsedPreviewMarkdown: PreviewMarkdownParse): DecorationSet {
  const startedAt = readEditorInputDiagnosticTime();
  const ranges = buildPreviewAtomicRangeSet(parsedPreviewMarkdown, getEditedMathRange(view.state));
  logEditorInputDiagnostic('live-markdown-atomic-ranges', {
    totalMs: readEditorInputDiagnosticTime() - startedAt
  });
  return ranges;
}

export function shouldReparsePreviewMarkdown(update: Pick<ViewUpdate, 'docChanged'>) {
  return update.docChanged;
}

function isPlainTextInputChange(update: ViewUpdate) {
  if (MARKDOWN_DECORATION_CONTEXT_PATTERN.test(update.startState.doc.toString())) {
    return false;
  }
  let plainTextInput = false;
  let changeCount = 0;
  update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    changeCount += 1;
    if (changeCount > 1 || fromA !== toA) {
      plainTextInput = false;
      return;
    }
    const text = inserted.toString();
    plainTextInput = text.length > 0 && !/[\n\r]/.test(text);
  });
  return plainTextInput;
}

export function shouldMapDocumentInputDecorations(args: {
  docChanged: boolean;
  editedMathRangeChanged: boolean;
  imageClozePresentationChanged: boolean;
  localDocumentPathChanged: boolean;
  nodeIdChanged: boolean;
  plainTextInputChange: boolean;
  textAnchorDecorationsChanged: boolean;
}) {
  return args.docChanged &&
    args.plainTextInputChange &&
    !args.nodeIdChanged &&
    !args.localDocumentPathChanged &&
    !args.imageClozePresentationChanged &&
    !args.textAnchorDecorationsChanged &&
    !args.editedMathRangeChanged;
}

export const markdownLinePlugin = ViewPlugin.fromClass(
  class {
    atomicRanges: DecorationSet;
    decorations: DecorationSet;
    cursorLineNumber: number | null;
    parsedPreviewMarkdown: PreviewMarkdownParse;
    previewParseDirty = false;

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
      const plainTextInputChange = isPlainTextInputChange(update);
      const shouldMapInputDecorations = shouldMapDocumentInputDecorations({
        docChanged: update.docChanged,
        editedMathRangeChanged,
        imageClozePresentationChanged,
        localDocumentPathChanged,
        nodeIdChanged,
        plainTextInputChange,
        textAnchorDecorationsChanged
      });

      if (shouldMapInputDecorations) {
        const startedAt = readEditorInputDiagnosticTime();
        this.atomicRanges = this.atomicRanges.map(update.changes);
        this.decorations = this.decorations.map(update.changes);
        logEditorInputDiagnostic('live-markdown-map-decorations', {
          totalMs: readEditorInputDiagnosticTime() - startedAt
        });
        this.cursorLineNumber = nextCursorLineNumber;
        this.previewParseDirty = true;
        return;
      }

      if (
        shouldRefreshLineDecorations(update, this.cursorLineNumber, nextCursorLineNumber) ||
        nodeIdChanged ||
        localDocumentPathChanged ||
        imageClozePresentationChanged ||
        textAnchorDecorationsChanged ||
        editedMathRangeChanged
      ) {
        if (this.previewParseDirty || shouldReparsePreviewMarkdown(update)) {
          this.parsedPreviewMarkdown = parsePreviewMarkdown(update.view);
          this.previewParseDirty = false;
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
