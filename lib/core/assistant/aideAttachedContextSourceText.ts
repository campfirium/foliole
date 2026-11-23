import type { AideContextUnit } from './aideAttachedContextAllocation.js';
import { readAideFrontmatterRange, type AideContextNode } from './aideAttachedContextSource.js';

interface TextBlock {
  end: number;
  heading: { level: number; text: string } | null;
  start: number;
  text: string;
}

const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*\s*$/u;

export function buildAideSurroundingUnits(content: string, range: { from: number; to: number }): AideContextUnit[] {
  const paragraphs = readBlocks(content).filter((block) => !block.heading);
  const beforeIndex = findLastIndex(paragraphs, (block) => block.end <= range.from);
  const after = paragraphs.find((block) => block.start >= range.to);
  const before = beforeIndex >= 0 ? paragraphs[beforeIndex] : undefined;
  return [
    ...(before ? [{ label: 'Before: ', text: before.text }] : []),
    ...(after ? [{ label: 'After: ', text: after.text }] : [])
  ];
}

// Direct chapter chain first (outer to inner), then the nearest neighbouring headings.
export function buildAideOutlineUnits(source: AideContextNode, position: number | null): AideContextUnit[] {
  const title = normalize(source.title);
  const headings = readBlocks(source.content)
    .flatMap((block) => (block.heading && normalize(block.heading.text) !== title ? [{ ...block.heading, start: block.start }] : []))
    .map((heading, index) => ({ ...heading, index }));
  if (!headings.length) return [];
  const minLevel = Math.min(...headings.map((heading) => heading.level));
  const chain: typeof headings = [];
  if (position !== null) {
    for (const heading of headings) {
      if (heading.start > position) break;
      while (chain.length && (chain[chain.length - 1]?.level ?? 0) >= heading.level) chain.pop();
      chain.push(heading);
    }
  }
  const current = chain[chain.length - 1];
  const inChain = new Set(chain.map((heading) => heading.index));
  const others = headings
    .filter((heading) => !inChain.has(heading.index))
    .sort((left, right) => distance(left.index, current?.index) - distance(right.index, current?.index) || left.index - right.index);
  return [...chain, ...others].map((heading) => ({
    atomic: true,
    rank: heading.index,
    text: `${'  '.repeat(heading.level - minLevel)}- ${heading.text}${heading === current ? ' (current)' : ''}`
  }));
}

function distance(index: number, current: number | undefined) {
  return current === undefined ? index : Math.abs(index - current);
}

function readBlocks(content: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let offset = readAideFrontmatterRange(content).end;
  let fenced = false;
  let current: { lines: string[]; start: number } | null = null;
  const flush = (end: number) => {
    if (current) blocks.push(toBlock(current.lines, current.start, end));
    current = null;
  };
  for (const line of content.slice(offset).split('\n')) {
    const lineEnd = offset + line.length;
    if (/^\s*(```|~~~)/u.test(line)) fenced = !fenced;
    if (!fenced && HEADING_PATTERN.test(line)) {
      flush(offset);
      blocks.push(toBlock([line], offset, lineEnd));
    } else if (!line.trim() && !fenced) {
      flush(offset);
    } else {
      current ??= { lines: [], start: offset };
      current.lines.push(line);
    }
    offset = lineEnd + 1;
  }
  flush(offset);
  return blocks.filter((block) => block.text);
}

function toBlock(lines: string[], start: number, end: number): TextBlock {
  const text = lines.join('\n').trim();
  const match = lines.length === 1 ? HEADING_PATTERN.exec(lines[0] ?? '') : null;
  return { end, heading: match ? { level: match[1]?.length ?? 1, text: match[2]?.trim() ?? '' } : null, start, text };
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) if (predicate(items[index] as T)) return index;
  return -1;
}

function normalize(value: string) {
  return value.replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
}
