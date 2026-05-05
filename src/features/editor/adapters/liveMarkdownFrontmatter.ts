import { type Range } from '@codemirror/state';
import { Decoration, WidgetType, type DecorationSet, type EditorView } from '@codemirror/view';

import { collectMarkdownLineClassRanges } from '../model/markdownBlockProjection';
import {
  projectMarkdownFrontmatter,
  type FrontmatterBounds
} from '../model/markdownFrontmatterProjection';

import { addLine, addReplace } from './liveMarkdownPrimitives';

export { extractFrontmatterEntries, resolveFrontmatterBounds } from '../model/markdownFrontmatterProjection';

export interface FrontmatterDecorationState {
  decorations: DecorationSet;
  inspectedUntilLine: number;
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

export function isLineWithinFrontmatter(bounds: FrontmatterBounds | null, lineNumber: number) {
  return Boolean(bounds && lineNumber >= bounds.startLine && lineNumber <= bounds.endLine);
}

function resolveSummaryHeadingLineNumber(view: EditorView, bounds: FrontmatterBounds) {
  const h1LineFroms = new Set(
    collectMarkdownLineClassRanges(view.state.doc.toString())
      .filter((range) => range.className === 'cm-line-h1')
      .map((range) => range.from)
  );
  for (let lineNumber = bounds.endLine + 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    if (h1LineFroms.has(line.from)) {
      return lineNumber;
    }
    if (line.text.trim().length > 0) {
      return null;
    }
  }

  return null;
}

function resolveSummaryInspectionLineNumber(view: EditorView, bounds: FrontmatterBounds) {
  for (let lineNumber = bounds.endLine + 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    if (line.text.trim().length > 0) {
      return lineNumber;
    }
  }

  return view.state.doc.lines;
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
  const { decorations } = buildFrontmatterDecorationState(view);
  decorations.between(0, view.state.doc.length, (from, to, decoration) => {
    ranges.push(decoration.range(from, to));
  });
}

export function buildFrontmatterDecorationSet(view: EditorView): DecorationSet {
  return buildFrontmatterDecorationState(view).decorations;
}

export function buildFrontmatterDecorationState(view: EditorView): FrontmatterDecorationState {
  const { doc } = view.state;
  const ranges: Range<Decoration>[] = [];
  const projection = projectMarkdownFrontmatter(doc.toString());
  const { bounds } = projection;

  if (!bounds) {
    return {
      decorations: Decoration.set(ranges, true),
      inspectedUntilLine: projection.inspectedUntilLine
    };
  }

  for (let lineNumber = bounds.startLine; lineNumber <= bounds.endLine; lineNumber += 1) {
    const line = doc.line(lineNumber);
    addLine(ranges, line.from, 'cm-line-frontmatter-hidden');
    addReplace(ranges, line.from, line.to);
  }

  const summary = projection.summary;
  const headingLineNumber = resolveSummaryHeadingLineNumber(view, bounds);
  const inspectedUntilLine = headingLineNumber ?? resolveSummaryInspectionLineNumber(view, bounds);

  if (!summary) {
    return {
      decorations: Decoration.set(ranges, true),
      inspectedUntilLine
    };
  }

  if (headingLineNumber) {
    hideBlankLinesAfterHeading(ranges, view, headingLineNumber);
  }

  const anchor = headingLineNumber ? doc.line(headingLineNumber).to : doc.line(bounds.endLine).to;
  ranges.push(
    Decoration.widget({
      side: 1,
      widget: new FrontmatterSummaryWidget(summary)
    }).range(anchor)
  );

  return {
    decorations: Decoration.set(ranges, true),
    inspectedUntilLine
  };
}
