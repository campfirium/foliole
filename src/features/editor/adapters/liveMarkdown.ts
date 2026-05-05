import { Facet } from '@codemirror/state';
import type { Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

import { openExternalUrl } from '../../../shared/platform/bridge';
import { getEditorDisplayMode } from '../model/editorDisplayMode';
import { getMarkdownSyntaxVisibility } from '../model/markdownSyntaxSetting';

import { handleMarkdownCompatibleHtmlPaste } from './htmlPaste';
import {
  addAnchorTagDecorations,
  collectSelectionTextWithExpandedLinks,
  getCursorLineNumber,
  INLINE_ANCHOR_TAG_PATTERN
} from './liveMarkdownAnchors';
import { addFrontmatterDecorations, isLineWithinFrontmatter, resolveFrontmatterBounds } from './liveMarkdownFrontmatter';
import {
  addImageDecorations,
  addInlineCodeDecorations,
  addInlineLinkDecorations,
  collectImageMatches,
  collectInlineCodeMatches,
  collectInlineLinkMatches
} from './liveMarkdownInlineDecorations';
import {
  addCodeFenceDecoration,
  addLine,
  addMark,
  addPrefixDecoration,
  CODE_FENCE_PATTERN,
  createLineClass
} from './liveMarkdownPrimitives';
import {
  addClozePlaceholderDecorations,
  addInlineCodeSyntaxDecorations,
  addInlineTokenDecorations,
  addSemanticMarkDecorations,
  addStrongTextDecorations,
  collectClozePlaceholderRanges
} from './liveMarkdownTextMarks';
import { liveMarkdownTheme } from './liveMarkdownTheme';

const hideTitleHeadingFacet = Facet.define<boolean, boolean>({
  combine: (values) => values[0] ?? false
});

export function createLiveMarkdown(hideTitleHeading = false) {
  return [hideTitleHeadingFacet.of(hideTitleHeading), liveMarkdownTheme, markdownLinePlugin, markdownInteractionHandlers];
}

function buildLineDecorations(view: EditorView): DecorationSet {
  if (getEditorDisplayMode() === 'source') return buildSourceModeDecorations(view);

  const ranges: Range<Decoration>[] = [];
  const content = view.state.doc.toString();
  const hideTitleHeading = view.state.facet(hideTitleHeadingFacet);
  addAnchorTagDecorations(ranges, content);
  addFrontmatterDecorations(ranges, view);
  const frontmatterBounds = resolveFrontmatterBounds(content);

  const showMarkdownSyntax = getMarkdownSyntaxVisibility() === 'visible';
  const cursorLineNumber = getCursorLineNumber(view);
  let inCodeBlock = false;

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    if (isLineWithinFrontmatter(frontmatterBounds, lineNumber)) {
      continue;
    }
    const isCodeFenceLine = CODE_FENCE_PATTERN.test(line.text);
    const lineClass = createLineClass(line.text, inCodeBlock);
    const isCursorLine = cursorLineNumber !== null && lineNumber === cursorLineNumber;
    const showSyntaxOnLine = showMarkdownSyntax && isCursorLine;
    const clozePlaceholderRanges = collectClozePlaceholderRanges(line.from, line.text);
    const imageMatches = collectImageMatches(line.from, line.text);
    const inlineCodeMatches = inCodeBlock ? [] : collectInlineCodeMatches(line.from, line.text);
    const imageRanges = imageMatches.map((imageMatch) => ({ from: imageMatch.from, to: imageMatch.to }));
    const inlineCodeRanges = inlineCodeMatches.map((match) => ({ from: match.from, to: match.to }));
    const preservedRanges = clozePlaceholderRanges.concat(imageRanges, inlineCodeRanges);
    const inlineLinkMatches = inCodeBlock ? [] : collectInlineLinkMatches(line.from, line.text, preservedRanges);

    if (lineClass) {
      if (hideTitleHeading && lineNumber === 1 && lineClass === 'cm-line-h1') {
        addLine(ranges, line.from, 'cm-line-title-heading-hidden');
      }
      if (isCodeFenceLine && !showSyntaxOnLine) addLine(ranges, line.from, 'cm-line-code-fence-hidden');
      else addLine(ranges, line.from, lineClass);
    }
    if (!showSyntaxOnLine && !isCursorLine && !inCodeBlock) addImageDecorations(ranges, imageMatches);

    addPrefixDecoration(ranges, line.from, line.text, showSyntaxOnLine);
    addCodeFenceDecoration(ranges, line.from, line.text, showSyntaxOnLine);
    addInlineCodeDecorations(ranges, inlineCodeMatches, showSyntaxOnLine);
    addInlineLinkDecorations(ranges, inlineLinkMatches, showSyntaxOnLine);
    addInlineTokenDecorations(ranges, line.from, line.text, inCodeBlock, showSyntaxOnLine, preservedRanges);
    addStrongTextDecorations(ranges, line.from, line.text, inCodeBlock);
    addSemanticMarkDecorations(ranges, line.from, line.text, inCodeBlock);
    addClozePlaceholderDecorations(ranges, clozePlaceholderRanges);

    if (CODE_FENCE_PATTERN.test(line.text)) inCodeBlock = !inCodeBlock;
  }

  return Decoration.set(ranges, true);
}

function buildSourceModeDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const content = view.state.doc.toString();
  let inCodeBlock = false;

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const clozePlaceholderRanges = collectClozePlaceholderRanges(line.from, line.text);
    const inlineCodeMatches = inCodeBlock ? [] : collectInlineCodeMatches(line.from, line.text);
    const inlineCodeRanges = inlineCodeMatches.map((match) => ({ from: match.from, to: match.to }));
    const preservedRanges = clozePlaceholderRanges.concat(inlineCodeRanges);
    const inlineLinkMatches = inCodeBlock ? [] : collectInlineLinkMatches(line.from, line.text, preservedRanges);

    addPrefixDecoration(ranges, line.from, line.text, true);
    addCodeFenceDecoration(ranges, line.from, line.text, true);
    addInlineCodeSyntaxDecorations(ranges, inlineCodeMatches);
    addInlineLinkDecorations(ranges, inlineLinkMatches, true);
    addInlineTokenDecorations(ranges, line.from, line.text, inCodeBlock, true, preservedRanges);
    addClozePlaceholderDecorations(ranges, clozePlaceholderRanges);

    if (CODE_FENCE_PATTERN.test(line.text)) inCodeBlock = !inCodeBlock;
  }

  let match = INLINE_ANCHOR_TAG_PATTERN.exec(content);
  while (match) {
    const from = match.index ?? -1;
    const raw = match[0] ?? '';
    const slashPart = match[1] ?? '';
    const kindPart = match[2] ?? '';
    const idPart = match[3] ?? '';

    if (from >= 0 && raw.length > 0) {
      const to = from + raw.length;
      const kindFrom = from + 1 + slashPart.length;
      const kindTo = kindFrom + kindPart.length;
      const idPrefix = 'id="';
      const idPrefixOffset = raw.indexOf(idPrefix);

      addMark(ranges, from, to, 'cm-md-anchor-tag-token');
      addMark(ranges, from, from + 1, 'cm-md-anchor-tag-delimiter');
      addMark(ranges, to - 1, to, 'cm-md-anchor-tag-delimiter');
      if (slashPart.length > 0) addMark(ranges, from + 1, from + 1 + slashPart.length, 'cm-md-anchor-tag-delimiter');
      addMark(ranges, kindFrom, kindTo, 'cm-md-anchor-tag-kind');

      if (idPrefixOffset >= 0) {
        const attrFrom = from + idPrefixOffset;
        const idFrom = attrFrom + idPrefix.length;
        const idTo = idFrom + idPart.length;
        addMark(ranges, attrFrom, idFrom, 'cm-md-anchor-tag-attr');
        addMark(ranges, idFrom, idTo, 'cm-md-anchor-tag-id');
        addMark(ranges, idTo, Math.min(idTo + 1, to), 'cm-md-anchor-tag-attr');
      }
    }
    match = INLINE_ANCHOR_TAG_PATTERN.exec(content);
  }
  INLINE_ANCHOR_TAG_PATTERN.lastIndex = 0;
  return Decoration.set(ranges, true);
}

const markdownLinePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildLineDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) {
        this.decorations = buildLineDecorations(update.view);
      }
    }
  },
  { decorations: (value) => value.decorations }
);

const markdownInteractionHandlers = EditorView.domEventHandlers({
  click(event) {
    const target = event.target;
    if (!(target instanceof Node)) return false;
    const element = target instanceof HTMLElement ? target : target.parentElement;
    if (!(element instanceof HTMLElement)) return false;

    const linkElement = element.closest('[data-md-link-url]');
    if (!(linkElement instanceof HTMLElement)) return false;
    const href = linkElement.dataset.mdLinkUrl;
    if (!href) return false;

    event.preventDefault();
    void openExternalUrl(href);
    return true;
  },
  copy(event, view) {
    const clipboard = event.clipboardData;
    if (!clipboard) return false;

    const expandedText = collectSelectionTextWithExpandedLinks(view);
    if (!expandedText) return false;

    event.preventDefault();
    clipboard.setData('text/plain', expandedText);
    return true;
  },
  paste(event, view) {
    if (!handleMarkdownCompatibleHtmlPaste(event.clipboardData, view)) {
      return false;
    }
    event.preventDefault();
    return true;
  }
});
