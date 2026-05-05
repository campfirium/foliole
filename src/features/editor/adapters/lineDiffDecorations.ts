import type { Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';

import { createLineClass } from '../model/markdownLineSyntax';

export type EditorDiffLineKind = 'added' | 'removed';

export interface EditorDiffSpacerLine {
  className: string | null;
  lineNumber: number;
  text: string;
}

export interface EditorDiffLineDecoration {
  kind: EditorDiffLineKind;
  lineNumber: number;
}

export interface EditorDiffSpacerDecoration {
  beforeLineNumber: number;
  kind: EditorDiffLineKind;
  measuredHeightPx?: number;
  lines: EditorDiffSpacerLine[];
}

export interface EditorDiffDecorations {
  lineDecorations: EditorDiffLineDecoration[];
  spacerDecorations: EditorDiffSpacerDecoration[];
}

class DiffSpacerWidget extends WidgetType {
  constructor(
    private readonly kind: EditorDiffLineKind,
    private readonly lines: EditorDiffSpacerLine[],
    private readonly measuredHeightPx?: number
  ) {
    super();
  }

  eq(other: DiffSpacerWidget) {
    return this.kind === other.kind && this.measuredHeightPx === other.measuredHeightPx && JSON.stringify(this.lines) === JSON.stringify(other.lines);
  }

  toDOM() {
    const wrapper = document.createElement('div');
    wrapper.className = `cm-diff-spacer cm-diff-spacer-${this.kind}`;

    if (this.measuredHeightPx && this.measuredHeightPx > 0) {
      wrapper.style.height = `${this.measuredHeightPx}px`;
      return wrapper;
    }

    this.lines.forEach((line) => {
      const row = document.createElement('div');
      row.className = ['cm-line', 'cm-diff-spacer-line', line.className ?? ''].filter(Boolean).join(' ');
      row.textContent = buildSpacerDisplayText(line.text, line.className);
      wrapper.append(row);
    });

    return wrapper;
  }
}

function buildSpacerDisplayText(text: string, className: string | null) {
  if (className === 'cm-line-code-fence') {
    return '';
  }
  if (className === 'cm-line-h1' || className === 'cm-line-h2' || className === 'cm-line-h3') {
    return text.replace(/^\s*#{1,6}\s*/, '');
  }
  if (className === 'cm-line-quote') {
    return text.replace(/^(\s*(?:>\s*)+)/, '');
  }
  if (className === 'cm-line-list-unordered') {
    return text.replace(/^(\s*[-*+]\s+)/, '• ');
  }
  if (className === 'cm-line-list') {
    return text.replace(/^(\s*)(\d+)([.)])(\s+)/, '$2$3 ');
  }
  return text;
}

function getDocLineStartPosition(view: EditorView, beforeLineNumber: number) {
  if (beforeLineNumber <= 1) {
    return 0;
  }
  if (beforeLineNumber > view.state.doc.lines) {
    return view.state.doc.length;
  }
  return view.state.doc.line(beforeLineNumber).from;
}

export function buildEditorDiffDecorations(view: EditorView, config: EditorDiffDecorations | null | undefined): DecorationSet {
  if (!config) {
    return Decoration.none;
  }

  const ranges: Range<Decoration>[] = [];

  config.lineDecorations.forEach((line) => {
    if (line.lineNumber < 1 || line.lineNumber > view.state.doc.lines) {
      return;
    }
    const lineFrom = view.state.doc.line(line.lineNumber).from;
    ranges.push(Decoration.line({ attributes: { class: `cm-diff-line cm-diff-line-${line.kind}` } }).range(lineFrom));
  });

  config.spacerDecorations.forEach((spacer) => {
    const position = getDocLineStartPosition(view, spacer.beforeLineNumber);
    ranges.push(
      Decoration.widget({
        block: true,
        side: -1,
        widget: new DiffSpacerWidget(spacer.kind, spacer.lines, spacer.measuredHeightPx)
      }).range(position)
    );
  });

  return Decoration.set(ranges, true);
}

export function buildLineClassProfiles(lines: string[]) {
  let inCodeBlock = false;

  return lines.map((text) => {
    const className = createLineClass(text, inCodeBlock);
    const profile = { className, text };
    if (/^\s*`{3,}/.test(text)) {
      inCodeBlock = !inCodeBlock;
    }
    return profile;
  });
}

export function createEmptyDiffDecorations(): EditorDiffDecorations {
  return { lineDecorations: [], spacerDecorations: [] };
}
