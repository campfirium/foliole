import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { createLineClass } from '../../features/editor/model/markdownLineSyntax';
import { collectMarkdownImageReferences } from '../../../lib/core/import/markdownImageReferences';

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

function isStandaloneMarkdownBlock(text: string, inCodeBlock: boolean) {
  const lineClass = createLineClass(text, inCodeBlock);
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

function pushSelection(selections: EditorSelection[], from: number | null, to: number) {
  if (from !== null && from < to) {
    selections.push({ from, to });
  }
}

export function getParagraphSelections(content: string): EditorSelection[] {
  const lines = buildLineRanges(content);
  const selections: EditorSelection[] = [];
  let paragraphStart: number | null = null;
  let paragraphEnd = 0;
  let inCodeBlock = false;
  let tableStart: number | null = null;
  let tableEnd = 0;

  lines.forEach((line) => {
    if (line.blank) {
      pushSelection(selections, tableStart, tableEnd);
      pushSelection(selections, paragraphStart, paragraphEnd);
      tableStart = null;
      tableEnd = 0;
      paragraphStart = null;
      paragraphEnd = 0;
      return;
    }
    const standaloneBlock = isStandaloneMarkdownBlock(line.text, inCodeBlock);
    if (/^\s*`{3,}/.test(line.text)) {
      inCodeBlock = !inCodeBlock;
    }
    if (isMarkdownTableLine(line.text)) {
      pushSelection(selections, paragraphStart, paragraphEnd);
      paragraphStart = null;
      paragraphEnd = 0;
      if (tableStart === null) {
        tableStart = line.start;
      }
      tableEnd = line.end;
      return;
    }
    pushSelection(selections, tableStart, tableEnd);
    tableStart = null;
    tableEnd = 0;
    if (isStandaloneMarkdownImageLine(line.text)) {
      pushSelection(selections, paragraphStart, paragraphEnd);
      selections.push({ from: line.start, to: line.end });
      paragraphStart = null;
      paragraphEnd = 0;
      return;
    }
    if (standaloneBlock) {
      pushSelection(selections, paragraphStart, paragraphEnd);
      selections.push({ from: line.start, to: line.end });
      paragraphStart = null;
      paragraphEnd = 0;
      return;
    }
    if (paragraphStart === null) {
      paragraphStart = line.start;
    }
    paragraphEnd = line.end;
  });

  pushSelection(selections, tableStart, tableEnd);
  pushSelection(selections, paragraphStart, paragraphEnd);
  return selections;
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
