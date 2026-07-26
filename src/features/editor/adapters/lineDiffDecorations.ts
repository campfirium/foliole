import { StateEffect, StateField, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';

import { collectMarkdownLineClassRanges } from '../model/markdownBlockProjection';
import { collectMarkdownCodeFenceProjection } from '../model/markdownCodeFenceProjection';

export type EditorDiffLineKind = 'added' | 'removed';

export interface EditorDiffSpacerLine {
  className: string | null;
  lineNumber: number;
  text: string;
}

interface EditorDiffLineDecoration {
  kind: EditorDiffLineKind;
  lineNumber: number;
}

interface EditorDiffSpacerDecoration {
  beforeLineNumber: number;
  kind: EditorDiffLineKind;
  measuredHeightPx?: number;
  lines: EditorDiffSpacerLine[];
}

export interface EditorDiffDecorations {
  lineDecorations: EditorDiffLineDecoration[];
  spacerDecorations: EditorDiffSpacerDecoration[];
}

export const setEditorDiffDecorationsEffect = StateEffect.define<DecorationSet>();
export const editorDiffDecorationsStateField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    let nextDecorations = decorations.map(transaction.changes);
    transaction.effects.forEach((effect) => {
      if (effect.is(setEditorDiffDecorationsEffect)) nextDecorations = effect.value;
    });
    return nextDecorations;
  },
  provide: (field) => EditorView.decorations.from(field)
});

class DiffSpacerWidget extends WidgetType {
  constructor(
    private readonly kind: EditorDiffLineKind,
    private readonly lines: EditorDiffSpacerLine[],
    private readonly measuredHeightPx?: number
  ) {
    super();
  }

  override eq(other: DiffSpacerWidget) {
    return this.kind === other.kind && this.measuredHeightPx === other.measuredHeightPx && JSON.stringify(this.lines) === JSON.stringify(other.lines);
  }

  override toDOM() {
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

function getDiffLineKey(kind: EditorDiffLineKind, lineNumber: number) {
  return `${kind}:${lineNumber}`;
}

function getDiffLineEdgeClass(line: EditorDiffLineDecoration, lineKeys: ReadonlySet<string>) {
  const previousLineNumber = line.lineNumber - 1;
  const nextLineNumber = line.lineNumber + 1;
  const hasPrevious = lineKeys.has(getDiffLineKey(line.kind, previousLineNumber));
  const hasNext = lineKeys.has(getDiffLineKey(line.kind, nextLineNumber));
  return [hasPrevious ? null : 'cm-diff-line-first', hasNext ? null : 'cm-diff-line-last'].filter(Boolean).join(' ');
}

export function buildEditorDiffDecorations(view: EditorView, config: EditorDiffDecorations | null | undefined): DecorationSet {
  if (!config) {
    return Decoration.none;
  }

  const ranges: Range<Decoration>[] = [];
  const lineKeys = new Set(config.lineDecorations.map((line) => getDiffLineKey(line.kind, line.lineNumber)));

  config.lineDecorations.forEach((line) => {
    if (line.lineNumber < 1 || line.lineNumber > view.state.doc.lines) {
      return;
    }
    const lineFrom = view.state.doc.line(line.lineNumber).from;
    const edgeClass = getDiffLineEdgeClass(line, lineKeys);
    ranges.push(Decoration.line({ attributes: { class: `cm-diff-line cm-diff-line-${line.kind} ${edgeClass}` } }).range(lineFrom));
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
  const text = lines.join('\n');
  const codeFenceProjection = collectMarkdownCodeFenceProjection(text);
  const markdownLineClasses = new Map(collectMarkdownLineClassRanges(text).map((range) => [range.from, range.className]));
  let position = 0;

  return lines.map((text) => {
    const className = codeFenceProjection.fenceLineFroms.has(position)
      ? 'cm-line-code-fence'
      : codeFenceProjection.codeLineFroms.has(position)
        ? 'cm-line-code'
        : markdownLineClasses.get(position) ?? null;
    const profile = { className, text };
    position += text.length + 1;
    return profile;
  });
}

export function createEmptyDiffDecorations(): EditorDiffDecorations {
  return { lineDecorations: [], spacerDecorations: [] };
}
