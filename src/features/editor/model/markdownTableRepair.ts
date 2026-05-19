import type { EditorSelection } from '../adapters/EditorAdapter';

export interface MarkdownTableRepairEdit {
  content: string;
  from: number;
  to: number;
}

interface SourceLine {
  from: number;
  text: string;
  to: number;
  value: string;
}

function splitSourceLines(source: string): SourceLine[] {
  const matches = source.matchAll(/[^\n]*(?:\n|$)/g);
  const lines: SourceLine[] = [];
  for (const match of matches) {
    const value = match[0];
    if (!value) continue;
    const from = match.index ?? 0;
    const text = value.endsWith('\n') ? value.slice(0, -1) : value;
    lines.push({ from, text, to: from + value.length, value });
  }
  return lines;
}

function countPipes(text: string) {
  return text.split('|').length - 1;
}

function isPipeTableRow(text: string) {
  const trimmed = text.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && countPipes(trimmed) >= 2;
}

function splitTableRow(text: string) {
  const trimmed = text.trim();
  return trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined).split('|').map((cell) => cell.trim());
}

function isDelimiterCell(cell: string) {
  return /^:?-{3,}:?$/.test(cell);
}

function isDelimiterRow(text: string) {
  if (!isPipeTableRow(text)) return false;
  const cells = splitTableRow(text);
  return cells.length >= 2 && cells.every(isDelimiterCell);
}

function isBlockedPipeContext(text: string) {
  return /^\s*>/.test(text) || /^\s*(?:[-*+]|\d+\.)\s+.*\|/.test(text);
}

function isFenceLine(text: string) {
  return /^ {0,3}(?:```|~~~)/.test(text);
}

function buildCodeFenceMask(lines: SourceLine[]) {
  const mask = new Set<number>();
  let inFence = false;
  lines.forEach((line, index) => {
    if (inFence) mask.add(index);
    if (isFenceLine(line.text)) {
      mask.add(index);
      inFence = !inFence;
    }
  });
  return mask;
}

function lineIndexAt(lines: SourceLine[], position: number) {
  const index = lines.findIndex((line) => position >= line.from && position <= line.to);
  return index >= 0 ? index : Math.max(0, lines.length - 1);
}

function canJoinCandidateLine(line: SourceLine, codeFenceLines: Set<number>, index: number) {
  return !codeFenceLines.has(index) && (line.text.trim() === '' || (isPipeTableRow(line.text) && !isBlockedPipeContext(line.text)));
}

function findCursorBlock(lines: SourceLine[], position: number) {
  if (lines.length === 0) return null;
  const codeFenceLines = buildCodeFenceMask(lines);
  const cursorLineIndex = lineIndexAt(lines, position);
  const cursorLine = lines[cursorLineIndex];
  if (!cursorLine || !isPipeTableRow(cursorLine.text) || !canJoinCandidateLine(cursorLine, codeFenceLines, cursorLineIndex)) {
    return null;
  }
  let fromLine = cursorLineIndex;
  let toLine = cursorLineIndex;
  while (fromLine > 0 && canJoinCandidateLine(lines[fromLine - 1] as SourceLine, codeFenceLines, fromLine - 1)) fromLine -= 1;
  while (toLine < lines.length - 1 && canJoinCandidateLine(lines[toLine + 1] as SourceLine, codeFenceLines, toLine + 1)) toLine += 1;
  while (fromLine < toLine && lines[fromLine]?.text.trim() === '') fromLine += 1;
  while (toLine > fromLine && lines[toLine]?.text.trim() === '') toLine -= 1;
  return { fromLine, toLine };
}

function hasPipeRowAround(lines: SourceLine[], index: number, direction: -1 | 1) {
  for (let cursor = index + direction; cursor >= 0 && cursor < lines.length; cursor += direction) {
    const text = lines[cursor]?.text ?? '';
    if (text.trim() === '') continue;
    return isPipeTableRow(text);
  }
  return false;
}

function createDelimiterForRow(line: SourceLine) {
  return `| ${splitTableRow(line.text).map(() => '---').join(' | ')} |\n`;
}

function removeBlankLinesBetweenPipeRows(lines: SourceLine[]) {
  let changed = false;
  const nextLines = lines.filter((line, index) => {
    if (line.text.trim() !== '') return true;
    const isBetweenPipeRows = hasPipeRowAround(lines, index, -1) && hasPipeRowAround(lines, index, 1);
    if (isBetweenPipeRows) changed = true;
    return !isBetweenPipeRows;
  });
  return { changed, lines: nextLines };
}

function repairBlock(lines: SourceLine[], options: { createDelimiter: boolean }) {
  const compacted = removeBlankLinesBetweenPipeRows(lines);
  const hasDelimiter = compacted.lines.some((line) => isDelimiterRow(line.text));
  if (hasDelimiter) return compacted.changed ? compacted.lines.map((line) => line.value).join('') : null;
  if (!options.createDelimiter) return null;
  const firstPipeRowIndex = compacted.lines.findIndex((line) => isPipeTableRow(line.text));
  const firstPipeRow = compacted.lines[firstPipeRowIndex];
  if (!firstPipeRow) return null;
  return [
    ...compacted.lines.slice(0, firstPipeRowIndex + 1).map((line) => line.value),
    createDelimiterForRow(firstPipeRow),
    ...compacted.lines.slice(firstPipeRowIndex + 1).map((line) => line.value)
  ].join('');
}

function repairSelectedContent(content: string) {
  const lines = splitSourceLines(content);
  const codeFenceLines = buildCodeFenceMask(lines);
  let changed = false;
  const output: string[] = [];
  for (let index = 0; index < lines.length;) {
    if (!canJoinCandidateLine(lines[index] as SourceLine, codeFenceLines, index)) {
      output.push((lines[index] as SourceLine).value);
      index += 1;
      continue;
    }
    const start = index;
    while (index < lines.length && canJoinCandidateLine(lines[index] as SourceLine, codeFenceLines, index)) index += 1;
    const repaired = repairBlock(lines.slice(start, index), { createDelimiter: true });
    if (repaired !== null) {
      output.push(repaired);
      changed = true;
    } else {
      output.push(...lines.slice(start, index).map((line) => line.value));
    }
  }
  const nextContent = output.join('');
  return changed && nextContent !== content ? nextContent : null;
}

export function resolveMarkdownTableRepair(source: string, selection: EditorSelection): MarkdownTableRepairEdit | null {
  if (selection.from !== selection.to) {
    const from = Math.min(selection.from, selection.to);
    const to = Math.max(selection.from, selection.to);
    const content = repairSelectedContent(source.slice(from, to));
    return content === null ? null : { content, from, to };
  }

  const lines = splitSourceLines(source);
  const block = findCursorBlock(lines, selection.from);
  if (!block) return null;
  const blockLines = lines.slice(block.fromLine, block.toLine + 1);
  const content = repairBlock(blockLines, { createDelimiter: true });
  if (content === null) return null;
  return {
    content,
    from: blockLines[0]?.from ?? selection.from,
    to: blockLines[blockLines.length - 1]?.to ?? selection.to
  };
}
