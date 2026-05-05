import type { Range } from '@codemirror/state';
import { Decoration, WidgetType, type DecorationSet, type EditorView } from '@codemirror/view';

import { addLine, addReplace } from './liveMarkdownPrimitives';

const FRONTMATTER_DELIMITER_PATTERN = /^\s*---\s*$/;
const FRONTMATTER_KEY_VALUE_PATTERN = /^([^:#\s][^:]*?)(\s*:\s*)(.*)$/;
const FRONTMATTER_LIST_ITEM_PATTERN = /^(\s*)-\s+(.*)$/;
const WIKILINK_WRAPPER_PATTERN = /\[\[([^\]]+)\]\]/g;
const HEADING_PATTERN = /^\s*#\s+.+$/;

interface FrontmatterBounds {
  startLine: number;
  endLine: number;
}

interface FrontmatterEntry {
  key: string;
  values: string[];
}

class FrontmatterSummaryWidget extends WidgetType {
  readonly text: string;

  constructor(text: string) {
    super();
    this.text = text;
  }

  eq(other: FrontmatterSummaryWidget) {
    return this.text === other.text;
  }

  toDOM() {
    const element = document.createElement('div');
    element.className = 'cm-md-frontmatter-summary';
    element.style.color = 'color-mix(in srgb, var(--color-text-secondary) 72%, transparent)';
    element.style.display = 'block';
    element.style.fontSize = '1.2rem';
    element.style.fontWeight = '500';
    element.style.letterSpacing = '0.03em';
    element.style.lineHeight = '1.35';
    element.style.margin = '1.5rem 0 0.12rem';
    element.style.textAlign = 'center';
    element.style.width = '100%';
    element.textContent = this.text;
    return element;
  }
}

function isDelimiterLine(text: string) {
  return FRONTMATTER_DELIMITER_PATTERN.test(text);
}

function normalizeValue(value: string) {
  return value.replace(WIKILINK_WRAPPER_PATTERN, '$1').trim();
}

export function resolveFrontmatterBounds(content: string): FrontmatterBounds | null {
  const lines = content.split('\n');
  if (lines.length < 3 || !isDelimiterLine(lines[0] ?? '')) {
    return null;
  }

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

export function isLineWithinFrontmatter(bounds: FrontmatterBounds | null, lineNumber: number) {
  return Boolean(bounds && lineNumber >= bounds.startLine && lineNumber <= bounds.endLine);
}

export function extractFrontmatterEntries(content: string): FrontmatterEntry[] {
  const bounds = resolveFrontmatterBounds(content);
  if (!bounds) {
    return [];
  }

  const lines = content.split('\n').slice(bounds.startLine, bounds.endLine - 1);
  const entries: FrontmatterEntry[] = [];
  let currentEntry: FrontmatterEntry | null = null;

  for (const line of lines) {
    const keyMatch = line.match(FRONTMATTER_KEY_VALUE_PATTERN);
    if (keyMatch) {
      const key = keyMatch[1]?.trim() ?? '';
      const value = normalizeValue(keyMatch[3] ?? '');
      currentEntry = {
        key,
        values: value ? [value] : []
      };
      entries.push(currentEntry);
      continue;
    }

    const listMatch = line.match(FRONTMATTER_LIST_ITEM_PATTERN);
    if (listMatch && currentEntry) {
      const value = normalizeValue(listMatch[2] ?? '');
      if (value) {
        currentEntry.values.push(value);
      }
    }
  }

  return entries.filter((entry) => entry.values.length > 0);
}

function buildFrontmatterSummary(content: string) {
  const entries = extractFrontmatterEntries(content);
  return entries.flatMap((entry) => entry.values).join('  ·  ');
}

function resolveSummaryHeadingLineNumber(view: EditorView, bounds: FrontmatterBounds) {
  for (let lineNumber = bounds.endLine + 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    if (HEADING_PATTERN.test(line.text)) {
      return lineNumber;
    }
    if (line.text.trim().length > 0) {
      return null;
    }
  }

  return null;
}

function hideBlankLinesAfterHeading(ranges: Range<Decoration>[], view: EditorView, headingLineNumber: number) {
  for (let lineNumber = headingLineNumber + 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    if (line.text.trim().length > 0) {
      return;
    }
    addLine(ranges, line.from, 'cm-line-frontmatter-hidden');
    addReplace(ranges, line.from, line.to);
  }
}

export function addFrontmatterDecorations(ranges: Range<Decoration>[], view: EditorView) {
  const content = view.state.doc.toString();
  const bounds = resolveFrontmatterBounds(content);
  if (!bounds) {
    return;
  }

  for (let lineNumber = bounds.startLine; lineNumber <= bounds.endLine; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    addLine(ranges, line.from, 'cm-line-frontmatter-hidden');
    addReplace(ranges, line.from, line.to);
  }

  const summary = buildFrontmatterSummary(content);
  if (!summary) {
    return;
  }

  const headingLineNumber = resolveSummaryHeadingLineNumber(view, bounds);
  if (headingLineNumber) {
    hideBlankLinesAfterHeading(ranges, view, headingLineNumber);
  }

  const anchor = headingLineNumber ? view.state.doc.line(headingLineNumber).to : view.state.doc.line(bounds.endLine).to;
  ranges.push(
    Decoration.widget({
      side: 1,
      widget: new FrontmatterSummaryWidget(summary)
    }).range(anchor)
  );
}

export function buildFrontmatterDecorationSet(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  addFrontmatterDecorations(ranges, view);
  return Decoration.set(ranges, true);
}
