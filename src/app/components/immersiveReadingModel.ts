import { collectMarkdownImageReferences } from '../../../lib/core/import/markdownImageReferences';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { collectMarkdownLineClassRanges } from '../../features/editor/model/markdownBlockProjection';
import { collectMarkdownCodeFenceProjection } from '../../features/editor/model/markdownCodeFenceProjection';

function buildLineRanges(content: string) {
  const lines: Array<{ blank: boolean; end: number; start: number; text: string }> = [];
  let lineStart = 0;
  for (let index = 0; index <= content.length; index += 1) {
    if (index < content.length && content[index] !== '\n') {
      continue;
    }
    const line = content.slice(lineStart, index);
    lines.push({
      blank: line.trim().length === 0,
      end: index,
      start: lineStart,
      text: line
    });
    lineStart = index + 1;
  }
  return lines;
}

function isStandaloneMarkdownBlock(lineClass: string | null) {
  return (
    lineClass === 'cm-line-h1' ||
    lineClass === 'cm-line-h2' ||
    lineClass === 'cm-line-h3' ||
    lineClass === 'cm-line-list' ||
    lineClass === 'cm-line-list-unordered'
  );
}

function isMarkdownTableLine(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
    return false;
  }
  return trimmed.length > 1;
}

function isStandaloneMarkdownImageLine(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('![')) {
    return false;
  }
  const matches = collectMarkdownImageReferences(trimmed);
  return matches.length === 1 && matches[0]?.fullMatch === trimmed;
}

function resolveMarkdownLineClass(args: {
  lineStart: number;
  codeLineFroms: ReadonlySet<number>;
  fenceLineFroms: ReadonlySet<number>;
  markdownLineClasses: ReadonlyMap<number, string>;
}) {
  if (args.fenceLineFroms.has(args.lineStart)) return 'cm-line-code-fence';
  if (args.codeLineFroms.has(args.lineStart)) return 'cm-line-code';
  return args.markdownLineClasses.get(args.lineStart) ?? null;
}

function pushSelection(selections: EditorSelection[], from: number | null, to: number) {
  if (from !== null && from < to) {
    selections.push({ from, to });
  }
}

interface ParagraphSelectionState {
  paragraphEnd: number;
  paragraphStart: number | null;
  selections: EditorSelection[];
  tableEnd: number;
  tableStart: number | null;
}

function flushTable(state: ParagraphSelectionState) {
  pushSelection(state.selections, state.tableStart, state.tableEnd);
  state.tableStart = null;
  state.tableEnd = 0;
}

function flushParagraph(state: ParagraphSelectionState) {
  pushSelection(state.selections, state.paragraphStart, state.paragraphEnd);
  state.paragraphStart = null;
  state.paragraphEnd = 0;
}

function visitParagraphLine(
  state: ParagraphSelectionState,
  line: ReturnType<typeof buildLineRanges>[number],
  codeLineFroms: ReadonlySet<number>,
  fenceLineFroms: ReadonlySet<number>,
  markdownLineClasses: ReadonlyMap<number, string>
) {
  if (line.blank) {
    flushTable(state);
    flushParagraph(state);
    return;
  }
  const lineClass = resolveMarkdownLineClass({
    codeLineFroms,
    fenceLineFroms,
    lineStart: line.start,
    markdownLineClasses
  });
  const standaloneBlock = isStandaloneMarkdownBlock(lineClass);
  if (isMarkdownTableLine(line.text)) {
    flushParagraph(state);
    if (state.tableStart === null) {
      state.tableStart = line.start;
    }
    state.tableEnd = line.end;
    return;
  }
  flushTable(state);
  if (isStandaloneMarkdownImageLine(line.text)) {
    flushParagraph(state);
    state.selections.push({ from: line.start, to: line.end });
    return;
  }
  if (standaloneBlock) {
    flushParagraph(state);
    state.selections.push({ from: line.start, to: line.end });
    return;
  }
  if (state.paragraphStart === null) {
    state.paragraphStart = line.start;
  }
  state.paragraphEnd = line.end;
}

export function getParagraphSelections(content: string): EditorSelection[] {
  const codeFenceProjection = collectMarkdownCodeFenceProjection(content);
  const markdownLineClasses = new Map(collectMarkdownLineClassRanges(content).map((range) => [range.from, range.className]));
  const state: ParagraphSelectionState = {
    paragraphEnd: 0,
    paragraphStart: null,
    selections: [],
    tableEnd: 0,
    tableStart: null
  };

  buildLineRanges(content).forEach((line) => {
    visitParagraphLine(state, line, codeFenceProjection.codeLineFroms, codeFenceProjection.fenceLineFroms, markdownLineClasses);
  });

  flushTable(state);
  flushParagraph(state);
  return state.selections;
}

function isSameSelection(left: EditorSelection, right: EditorSelection) {
  return left.from === right.from && left.to === right.to;
}

function findContainingParagraphIndex(paragraphs: EditorSelection[], selection: EditorSelection) {
  return paragraphs.findIndex((paragraph) => selection.from >= paragraph.from && selection.to <= paragraph.to);
}

export function resolveCurrentParagraphSelection(content: string, currentSelection: EditorSelection): EditorSelection | null {
  const paragraphs = getParagraphSelections(content);
  if (paragraphs.length === 0) {
    return null;
  }

  const currentIndex = findContainingParagraphIndex(paragraphs, currentSelection);
  if (currentIndex >= 0) {
    return paragraphs[currentIndex] ?? null;
  }

  const anchor = Math.max(currentSelection.from, currentSelection.to);
  return paragraphs.find((paragraph) => paragraph.from >= anchor) ?? paragraphs[paragraphs.length - 1] ?? null;
}

export function resolveParagraphSelection(args: {
  content: string;
  currentSelection: EditorSelection;
  direction: 'backward' | 'forward';
}): EditorSelection | null {
  const paragraphs = getParagraphSelections(args.content);
  if (paragraphs.length === 0) {
    return null;
  }

  const currentIndex = findContainingParagraphIndex(paragraphs, args.currentSelection);
  if (currentIndex >= 0) {
    const currentParagraph = paragraphs[currentIndex];
    if (!isSameSelection(currentParagraph, args.currentSelection)) {
      return currentParagraph;
    }
    const nextIndex = args.direction === 'forward' ? currentIndex + 1 : currentIndex - 1;
    return paragraphs[nextIndex] ?? null;
  }

  if (args.direction === 'forward') {
    const anchor = Math.max(args.currentSelection.from, args.currentSelection.to);
    return paragraphs.find((paragraph) => paragraph.from >= anchor) ?? null;
  }

  const anchor = Math.min(args.currentSelection.from, args.currentSelection.to);
  for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
    if (paragraphs[index].to <= anchor) {
      return paragraphs[index];
    }
  }
  return null;
}
