import { projectMarkdownInlineText } from './markdownInlineTextProjection';

const FRONTMATTER_DELIMITER_PATTERN = /^\s*---\s*$/;
const FRONTMATTER_KEY_VALUE_PATTERN = /^([^:#\s][^:]*?)(\s*:\s*)(.*)$/;
const FRONTMATTER_LIST_ITEM_PATTERN = /^(\s*)-\s+(.*)$/;

export interface FrontmatterBounds {
  startLine: number;
  endLine: number;
}

export interface FrontmatterEntry {
  key: string;
  values: string[];
}

export interface MarkdownFrontmatterProjection {
  bounds: FrontmatterBounds | null;
  entries: FrontmatterEntry[];
  inspectedUntilLine: number;
  summary: string;
}

function isDelimiterLine(text: string) {
  return FRONTMATTER_DELIMITER_PATTERN.test(text);
}

function normalizeValue(value: string) {
  return projectMarkdownInlineText(value)
    .map((token) => {
      if (token.kind === 'footnote') return token.label;
      return 'text' in token ? token.text : '';
    })
    .join('')
    .trim();
}

function resolveFrontmatterBoundsInLines(lines: readonly string[]): FrontmatterBounds | null {
  if (lines.length < 3 || !isDelimiterLine(lines[0] ?? '')) return null;

  for (let index = 1; index < lines.length; index += 1) {
    if (isDelimiterLine(lines[index] ?? '')) {
      return {
        startLine: 1,
        endLine: index + 1
      };
    }
  }

  return null;
}

function extractFrontmatterEntriesFromLines(lines: readonly string[], bounds: FrontmatterBounds): FrontmatterEntry[] {
  const entries: FrontmatterEntry[] = [];
  let currentEntry: FrontmatterEntry | null = null;

  for (let index = bounds.startLine; index < bounds.endLine - 1; index += 1) {
    const line = lines[index] ?? '';
    const keyMatch = line.match(FRONTMATTER_KEY_VALUE_PATTERN);
    if (keyMatch) {
      currentEntry = {
        key: keyMatch[1]?.trim() ?? '',
        values: resolveEntryValues(keyMatch[3] ?? '')
      };
      entries.push(currentEntry);
      continue;
    }

    const listMatch = line.match(FRONTMATTER_LIST_ITEM_PATTERN);
    if (listMatch && currentEntry) {
      const value = normalizeValue(listMatch[2] ?? '');
      if (value) currentEntry.values.push(value);
    }
  }

  return entries.filter((entry) => entry.values.length > 0);
}

function resolveEntryValues(rawValue: string) {
  const value = normalizeValue(rawValue);
  return value ? [value] : [];
}

export function buildFrontmatterSummary(entries: readonly FrontmatterEntry[]) {
  return entries.flatMap((entry) => entry.values).join('  ·  ');
}

export function resolveFrontmatterBounds(content: string): FrontmatterBounds | null {
  return resolveFrontmatterBoundsInLines(content.split('\n'));
}

export function extractFrontmatterEntries(content: string): FrontmatterEntry[] {
  const lines = content.split('\n');
  const bounds = resolveFrontmatterBoundsInLines(lines);
  return bounds ? extractFrontmatterEntriesFromLines(lines, bounds) : [];
}

export function projectMarkdownFrontmatter(content: string): MarkdownFrontmatterProjection {
  const lines = content.split('\n');
  const bounds = resolveFrontmatterBoundsInLines(lines);
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
