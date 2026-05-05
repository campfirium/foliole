import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';

function buildLineRanges(content: string) {
  const lines: Array<{ blank: boolean; end: number; start: number }> = [];
  let lineStart = 0;
  for (let index = 0; index <= content.length; index += 1) {
    if (index < content.length && content[index] !== '\n') {
      continue;
    }
    const line = content.slice(lineStart, index);
    lines.push({
      blank: line.trim().length === 0,
      end: index,
      start: lineStart
    });
    lineStart = index + 1;
  }
  return lines;
}

export function getParagraphSelections(content: string): EditorSelection[] {
  const lines = buildLineRanges(content);
  const selections: EditorSelection[] = [];
  let paragraphStart: number | null = null;
  let paragraphEnd = 0;

  lines.forEach((line) => {
    if (line.blank) {
      if (paragraphStart !== null && paragraphStart < paragraphEnd) {
        selections.push({ from: paragraphStart, to: paragraphEnd });
      }
      paragraphStart = null;
      paragraphEnd = 0;
      return;
    }
    if (paragraphStart === null) {
      paragraphStart = line.start;
    }
    paragraphEnd = line.end;
  });

  if (paragraphStart !== null && paragraphStart < paragraphEnd) {
    selections.push({ from: paragraphStart, to: paragraphEnd });
  }
  return selections;
}

function isSameSelection(left: EditorSelection, right: EditorSelection) {
  return left.from === right.from && left.to === right.to;
}

function findContainingParagraphIndex(paragraphs: EditorSelection[], selection: EditorSelection) {
  return paragraphs.findIndex((paragraph) => selection.from >= paragraph.from && selection.to <= paragraph.to);
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
