import { Facet, type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

import { openExternalUrl } from '../../../shared/platform/bridge';
import { getEditorDisplayMode } from '../model/editorDisplayMode';
import { getMarkdownSyntaxVisibility } from '../model/markdownSyntaxSetting';

import { createClipboardExportFromView, FOLIOLE_CLIPBOARD_MIME } from './clipboardInterop';
import { handleMarkdownCompatibleHtmlPaste } from './htmlPaste';
import { handleClipboardImagePaste } from './htmlPaste';
import { handleInternalClipboardPaste } from './htmlPaste';
import { getCursorLineNumber } from './liveMarkdownAnchors';
import { codeFenceLineNumbersField, resolveCodeBlockStateBeforeLine } from './liveMarkdownCodeBlocks';
import { addFootnoteDecorations } from './liveMarkdownFootnotes';
import {
  addImageDecorations,
  addInlineCodeDecorations,
  addInlineLinkDecorations,
  addWikiLinkDecorations
} from './liveMarkdownInlineDecorations';
import { collectPreviewLineMatchState, collectSourceLineMatchState } from './liveMarkdownLineMatches';
import {
  addCodeFenceDecoration,
  addLine,
  addPrefixDecoration,
  CODE_FENCE_PATTERN,
  createLineClass
} from './liveMarkdownPrimitives';
import { markdownStaticPlugin } from './liveMarkdownStaticDecorations';
import {
  addClozePlaceholderDecorations,
  addInlineCodeSyntaxDecorations,
  addInlineTokenDecorations,
  addSemanticMarkDecorations,
  addStrongTextDecorations
} from './liveMarkdownTextMarks';
import { liveMarkdownTheme } from './liveMarkdownTheme';
import { resolveVisibleLineWindow, shouldRefreshLineDecorations } from './liveMarkdownViewport';

const hideTitleHeadingFacet = Facet.define<boolean, boolean>({
  combine: (values) => values[0] ?? false
});

const activeNodeIdFacet = Facet.define<string | null, string | null>({
  combine: (values) => values[0] ?? null
});

const imageClozePresentationVersionFacet = Facet.define<number, number>({
  combine: (values) => values[0] ?? 0
});

const hiddenTextAnchorKeysFacet = Facet.define<readonly string[], readonly string[]>({
  combine: (values) => values[0] ?? []
});

const openNodeLinkFacet = Facet.define<((title: string) => void) | null, ((title: string) => void) | null>({
  combine: (values) => values[0] ?? null
});

export function createLiveMarkdown(
  hideTitleHeading = false,
  nodeId: string | null = null,
  imageClozePresentationVersion = 0,
  hiddenTextAnchorKeys: readonly string[] = [],
  onOpenNodeLink: ((title: string) => void) | null = null
) {
  return [
    hideTitleHeadingFacet.of(hideTitleHeading),
    activeNodeIdFacet.of(nodeId),
    imageClozePresentationVersionFacet.of(imageClozePresentationVersion),
    hiddenTextAnchorKeysFacet.of(hiddenTextAnchorKeys),
    openNodeLinkFacet.of(onOpenNodeLink),
    liveMarkdownTheme,
    codeFenceLineNumbersField,
    markdownStaticPlugin,
    markdownLinePlugin,
    markdownInteractionHandlers
  ];
}

function buildLineDecorations(view: EditorView): DecorationSet {
  if (getEditorDisplayMode() === 'source') return buildSourceModeLineDecorations(view);

  const ranges: Range<Decoration>[] = [];
  const activeNodeId = view.state.facet(activeNodeIdFacet);
  const imageClozePresentationVersion = view.state.facet(imageClozePresentationVersionFacet);
  const hideTitleHeading = view.state.facet(hideTitleHeadingFacet);
  const { endLineNumber, startLineNumber } = resolveVisibleLineWindow(view);
  const showMarkdownSyntax = getMarkdownSyntaxVisibility() === 'visible';
  const cursorLineNumber = getCursorLineNumber(view);
  let inCodeBlock = resolveCodeBlockStateBeforeLine(view.state, startLineNumber);

  for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const isCodeFenceLine = CODE_FENCE_PATTERN.test(line.text);
    const lineClass = createLineClass(line.text, inCodeBlock);
    const isCursorLine = cursorLineNumber !== null && lineNumber === cursorLineNumber;
    const showSyntaxOnLine = showMarkdownSyntax && isCursorLine;
    const { clozePlaceholderRanges, footnoteMatches, footnoteRanges, imageMatches, inlineCodeMatches, inlineLinkMatches, preservedRanges, wikiLinkMatches } =
      collectPreviewLineMatchState(line.from, line.text, inCodeBlock);

    if (lineClass) {
      if (hideTitleHeading && lineNumber === 1 && lineClass === 'cm-line-h1') {
        addLine(ranges, line.from, 'cm-line-title-heading-hidden');
      }
      if (isCodeFenceLine && !showSyntaxOnLine) addLine(ranges, line.from, 'cm-line-code-fence-hidden');
      else addLine(ranges, line.from, lineClass);
    }
    if (!inCodeBlock) addImageDecorations(ranges, imageMatches, false, activeNodeId, imageClozePresentationVersion);

    if (!inCodeBlock || isCodeFenceLine) {
      addPrefixDecoration(ranges, line.from, line.text, showSyntaxOnLine);
    }
    addCodeFenceDecoration(ranges, line.from, line.text, showSyntaxOnLine);
    addFootnoteDecorations(ranges, footnoteMatches);
    addInlineCodeDecorations(ranges, inlineCodeMatches, showSyntaxOnLine);
    addInlineLinkDecorations(ranges, inlineLinkMatches, showSyntaxOnLine);
    addWikiLinkDecorations(ranges, wikiLinkMatches, showSyntaxOnLine);
    addInlineTokenDecorations(ranges, line.from, line.text, inCodeBlock, showSyntaxOnLine, preservedRanges.concat(footnoteRanges));
    addStrongTextDecorations(ranges, line.from, line.text, inCodeBlock);
    addSemanticMarkDecorations(ranges, line.from, line.text, inCodeBlock);
    addClozePlaceholderDecorations(ranges, clozePlaceholderRanges);

    if (CODE_FENCE_PATTERN.test(line.text)) inCodeBlock = !inCodeBlock;
  }

  return Decoration.set(ranges, true);
}

function buildSourceModeLineDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { endLineNumber, startLineNumber } = resolveVisibleLineWindow(view);
  let inCodeBlock = resolveCodeBlockStateBeforeLine(view.state, startLineNumber);

  for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const { clozePlaceholderRanges, footnoteMatches, footnoteRanges, inlineCodeMatches, inlineLinkMatches, preservedRanges, wikiLinkMatches } =
      collectSourceLineMatchState(line.from, line.text, inCodeBlock);

    addPrefixDecoration(ranges, line.from, line.text, true);
    addCodeFenceDecoration(ranges, line.from, line.text, true);
    addFootnoteDecorations(ranges, footnoteMatches);
    addInlineCodeSyntaxDecorations(ranges, inlineCodeMatches);
    addInlineLinkDecorations(ranges, inlineLinkMatches, true);
    addWikiLinkDecorations(ranges, wikiLinkMatches, true);
    addInlineTokenDecorations(ranges, line.from, line.text, inCodeBlock, true, preservedRanges.concat(footnoteRanges));
    addClozePlaceholderDecorations(ranges, clozePlaceholderRanges);

    if (CODE_FENCE_PATTERN.test(line.text)) inCodeBlock = !inCodeBlock;
  }

  return Decoration.set(ranges, true);
}

const markdownLinePlugin = ViewPlugin.fromClass(
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
      const hiddenTextAnchorKeysChanged =
        update.startState.facet(hiddenTextAnchorKeysFacet) !== update.state.facet(hiddenTextAnchorKeysFacet);
      const nextCursorLineNumber = getCursorLineNumber(update.view);
      if (
        shouldRefreshLineDecorations(update, this.cursorLineNumber, nextCursorLineNumber) ||
        nodeIdChanged ||
        imageClozePresentationChanged ||
        hiddenTextAnchorKeysChanged
      ) {
        this.decorations = buildLineDecorations(update.view);
      }
      this.cursorLineNumber = nextCursorLineNumber;
    }
  },
  { decorations: (value) => value.decorations }
);

export function getHiddenTextAnchorKeys(value: EditorView | { facet: EditorView['state']['facet'] }) {
  if ('state' in value) {
    return value.state.facet(hiddenTextAnchorKeysFacet);
  }
  return value.facet(hiddenTextAnchorKeysFacet);
}

const markdownInteractionHandlers = EditorView.domEventHandlers({
  click(event) {
    const target = event.target;
    if (!(target instanceof Node)) return false;
    const element = target instanceof HTMLElement ? target : target.parentElement;
    if (!(element instanceof HTMLElement)) return false;

    const linkElement = element.closest('[data-md-link-url]');
    if (linkElement instanceof HTMLElement) {
      const href = linkElement.dataset.mdLinkUrl;
      if (!href) return false;
      event.preventDefault();
      void openExternalUrl(href);
      return true;
    }

    const wikiLinkElement = element.closest('[data-md-link-node-title]');
    if (!(wikiLinkElement instanceof HTMLElement)) return false;
    const title = wikiLinkElement.dataset.mdLinkNodeTitle;
    const editorHost = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const editorView = editorHost ? EditorView.findFromDOM(editorHost) : null;
    const onOpenNodeLink = editorView?.state.facet(openNodeLinkFacet) ?? null;
    if (!title || !onOpenNodeLink) return false;

    event.preventDefault();
    onOpenNodeLink(title);
    return true;
  },
  copy(event, view) {
    const clipboard = event.clipboardData;
    if (!clipboard) return false;

    const exportPayload = createClipboardExportFromView(view);
    if (!exportPayload) return false;

    event.preventDefault();
    clipboard.setData('text/plain', exportPayload.externalText);
    clipboard.setData('text/html', exportPayload.externalHtml);
    clipboard.setData(FOLIOLE_CLIPBOARD_MIME, exportPayload.internalText);
    return true;
  },
  paste(event, view) {
    if (handleClipboardImagePaste(event.clipboardData, view, view.state.facet(activeNodeIdFacet))) {
      event.preventDefault();
      return true;
    }
    if (handleInternalClipboardPaste(event.clipboardData, view)) {
      event.preventDefault();
      return true;
    }
    if (!handleMarkdownCompatibleHtmlPaste(event.clipboardData, view)) {
      return false;
    }
    event.preventDefault();
    return true;
  }
});
