import type { MarkdownTableCellAlignment, MarkdownTableCellPlan } from './markdownTablePlans';

export function collectPipeSeparatedTableCells(args: {
  alignments: readonly MarkdownTableCellAlignment[];
  offset: number;
  rowFrom: number;
  rowTo: number;
  source: string;
}): MarkdownTableCellPlan[] {
  const line = args.source.slice(args.rowFrom, args.rowTo);
  if (!line.includes('|')) return [];
  const pipeIndexes = collectUnescapedPipeIndexes(line);
  if (pipeIndexes.length === 0) return [];
  const startsWithPipe = line.trimStart().startsWith('|');
  const endsWithPipe = line.trimEnd().endsWith('|');
  const segments = startsWithPipe ? pipeIndexes.slice(0, -1) : [-1, ...pipeIndexes];
  return segments
    .map((startPipe, index) => {
      const nextPipe = pipeIndexes[startsWithPipe ? index + 1 : index] ?? line.length;
      if (endsWithPipe && nextPipe === line.length) return null;
      return createPipeCellPlan(args, line, startPipe + 1, nextPipe, args.alignments[index] ?? null);
    })
    .filter((cell): cell is MarkdownTableCellPlan => cell !== null);
}

function collectUnescapedPipeIndexes(line: string) {
  const indexes: number[] = [];
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '|' && line[index - 1] !== '\\') indexes.push(index);
  }
  return indexes;
}

function createPipeCellPlan(
  args: { offset: number; rowFrom: number },
  line: string,
  from: number,
  to: number,
  align: MarkdownTableCellAlignment
): MarkdownTableCellPlan {
  const rawText = line.slice(from, to);
  const leadingWhitespace = rawText.match(/^\s*/)?.[0].length ?? 0;
  const text = rawText.trim();
  return {
    align,
    from: args.offset + args.rowFrom + from + leadingWhitespace,
    text,
    to: args.offset + args.rowFrom + from + leadingWhitespace + text.length
  };
}
