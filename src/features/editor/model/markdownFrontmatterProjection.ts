import { folioleMarkdownParser } from './folioleMarkdownParser';
import { projectMarkdownInlineText } from './markdownInlineTextProjection';

type MarkdownSyntaxTree = ReturnType<typeof folioleMarkdownParser.parse>;
type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

export interface FrontmatterBounds {
  startLine: number;
  endLine: number;
}

export interface FrontmatterEntry {
  key: string;
  values: FrontmatterValue[];
}

interface FrontmatterValue {
  href?: string;
  text: string;
}

export interface MarkdownFrontmatterProjection {
  bounds: FrontmatterBounds | null;
  entries: FrontmatterEntry[];
  inspectedUntilLine: number;
  summary: string;
}

function isDelimiterLine(text: string) {
  return text.trim() === '---';
}

function isExternalUrl(value: string) {
  return /^https?:\/\/\S+$/i.test(value);
}

function projectValue(value: string): FrontmatterValue | null {
  const tokens = projectMarkdownInlineText(value);
  const text = tokens
    .map((token) => {
      if (token.kind === 'footnote') return token.label;
      return 'text' in token ? token.text : '';
    })
    .join('')
    .trim();
  if (!text) return null;
  const linkToken = tokens.length === 1 && (tokens[0]?.kind === 'autolink' || tokens[0]?.kind === 'link')
    ? tokens[0]
    : null;
  const href = linkToken?.href ?? (isExternalUrl(text) ? text : undefined);
  return href ? { href, text } : { text };
}

function isWhitespace(value: string) {
  return value === ' ' || value === '\t';
}

function parseFrontmatterKeyValueLine(line: string) {
  if (!line || line[0] === '#' || line[0] === ':' || isWhitespace(line[0] ?? '')) return null;
  const separatorIndex = line.indexOf(':');
  if (separatorIndex <= 0) return null;
  const key = line.slice(0, separatorIndex).trim();
  if (!key) return null;
  return {
    key,
    rawValue: line.slice(separatorIndex + 1).trim()
  };
}

function parseFrontmatterListItemLine(line: string) {
  let cursor = 0;
  while (cursor < line.length && isWhitespace(line[cursor] ?? '')) cursor += 1;
  if (line[cursor] !== '-') return null;
  const valueFrom = cursor + 1;
  if (!isWhitespace(line[valueFrom] ?? '')) return null;
  return line.slice(valueFrom).trim();
}

function findFrontmatterNode(node: MarkdownSyntaxNode): MarkdownSyntaxNode | null {
  if (node.name === 'Frontmatter') return node;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    const found = findFrontmatterNode(child);
    if (found) return found;
  }
  return null;
}

function lineNumberAt(content: string, position: number) {
  let lineNumber = 1;
  for (let index = 0; index < position; index += 1) {
    if (content[index] === '\n') lineNumber += 1;
  }
  return lineNumber;
}

function resolveFrontmatterBoundsFromParser(content: string): FrontmatterBounds | null {
  const tree = folioleMarkdownParser.parse(content);
  const frontmatter = findFrontmatterNode(tree.topNode);
  return frontmatter
    ? {
        startLine: lineNumberAt(content, frontmatter.from),
        endLine: lineNumberAt(content, frontmatter.to)
      }
    : null;
}

function extractFrontmatterEntriesFromLines(lines: readonly string[], bounds: FrontmatterBounds): FrontmatterEntry[] {
  const entries: FrontmatterEntry[] = [];
  let currentEntry: FrontmatterEntry | null = null;

  for (let index = bounds.startLine; index < bounds.endLine - 1; index += 1) {
    const line = lines[index] ?? '';
    const keyValue = parseFrontmatterKeyValueLine(line);
    if (keyValue) {
      currentEntry = {
        key: keyValue.key,
        values: resolveEntryValues(keyValue.rawValue)
      };
      entries.push(currentEntry);
      continue;
    }

    const listItem = parseFrontmatterListItemLine(line);
    if (listItem !== null && currentEntry) {
      const value = projectValue(listItem);
      if (value) currentEntry.values.push(value);
    }
  }

  return entries.filter((entry) => entry.values.length > 0);
}

function resolveEntryValues(rawValue: string) {
  const value = projectValue(rawValue);
  return value ? [value] : [];
}

function buildFrontmatterSummary(entries: readonly FrontmatterEntry[]) {
  return entries.map((entry) => entry.key).join('  ·  ');
}

export function resolveFrontmatterBounds(content: string): FrontmatterBounds | null {
  return resolveFrontmatterBoundsFromParser(content);
}

export function extractFrontmatterEntries(content: string): FrontmatterEntry[] {
  const lines = content.split('\n');
  const bounds = resolveFrontmatterBoundsFromParser(content);
  return bounds ? extractFrontmatterEntriesFromLines(lines, bounds) : [];
}

export function projectMarkdownFrontmatter(content: string): MarkdownFrontmatterProjection {
  const lines = content.split('\n');
  const bounds = resolveFrontmatterBoundsFromParser(content);
  if (!bounds) {
    return {
      bounds: null,
      entries: [],
      inspectedUntilLine: lines.length > 0 && isDelimiterLine(lines[0] ?? '') ? lines.length : 1,
      summary: ''
    };
  }

  const entries = extractFrontmatterEntriesFromLines(lines, bounds);
  return {
    bounds,
    entries,
    inspectedUntilLine: bounds.endLine,
    summary: buildFrontmatterSummary(entries)
  };
}
