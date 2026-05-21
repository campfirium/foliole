import 'katex/dist/katex.min.css';

import type { Range } from '@codemirror/state';
import { Decoration, type EditorView, WidgetType } from '@codemirror/view';
import katex from 'katex';

import type { MarkdownMathRange } from '../model/markdownMathExtension';

class MarkdownMathWidget extends WidgetType {
  readonly mathRange: MarkdownMathRange;

  constructor(mathRange: MarkdownMathRange) {
    super();
    this.mathRange = mathRange;
  }

  override eq(other: MarkdownMathWidget) {
    return (
      this.mathRange.display === other.mathRange.display &&
      this.mathRange.from === other.mathRange.from &&
      this.mathRange.source === other.mathRange.source &&
      this.mathRange.tex === other.mathRange.tex &&
      this.mathRange.to === other.mathRange.to
    );
  }

  override ignoreEvent(event: Event) {
    return !['click', 'mousedown', 'mousemove', 'mouseup', 'pointerdown', 'pointermove', 'pointerup'].includes(event.type);
  }

  override toDOM() {
    const wrapper = document.createElement(this.mathRange.display === 'block' ? 'div' : 'span');
    wrapper.className = this.mathRange.display === 'block' ? 'cm-md-math-widget-block' : 'cm-md-math-widget-inline';
    wrapper.dataset.mdMathDisplay = this.mathRange.display;
    wrapper.dataset.mdMathFrom = String(this.mathRange.from);
    wrapper.dataset.mdMathTo = String(this.mathRange.to);
    wrapper.dataset.mdMathTex = this.mathRange.tex;
    renderMath(wrapper, this.mathRange);
    return wrapper;
  }

  override updateDOM(dom: HTMLElement) {
    if (
      dom.dataset.mdMathDisplay !== this.mathRange.display ||
      dom.dataset.mdMathFrom !== String(this.mathRange.from) ||
      dom.dataset.mdMathTo !== String(this.mathRange.to) ||
      dom.dataset.mdMathTex !== this.mathRange.tex
    ) {
      return false;
    }
    return true;
  }
}

function renderMath(wrapper: HTMLElement, mathRange: MarkdownMathRange) {
  try {
    katex.render(mathRange.tex, wrapper, {
      displayMode: mathRange.display === 'block',
      output: 'htmlAndMathml',
      strict: 'warn',
      throwOnError: false,
      trust: false
    });
  } catch {
    wrapper.classList.add('cm-md-math-widget-error');
    wrapper.textContent = mathRange.source;
  }
}

function isActiveInsideMath(mathRange: MarkdownMathRange, activePosition: number | null) {
  return activePosition !== null && activePosition >= mathRange.from && activePosition <= mathRange.to;
}

export function addMathDecorations(
  ranges: Range<Decoration>[],
  mathRanges: ReadonlyArray<MarkdownMathRange>,
  view: EditorView,
  activePosition: number | null
) {
  for (const mathRange of mathRanges) {
    if (isActiveInsideMath(mathRange, activePosition)) continue;
    if (mathRange.display === 'block') {
      addBlockMathDecorations(ranges, mathRange, view);
      continue;
    }
    ranges.push(
      Decoration.replace({
        inclusive: false,
        widget: new MarkdownMathWidget(mathRange)
      }).range(mathRange.from, mathRange.to)
    );
  }
}

function addBlockMathDecorations(ranges: Range<Decoration>[], mathRange: MarkdownMathRange, view: EditorView) {
  const openingLine = view.state.doc.lineAt(mathRange.from);
  const closingLine = view.state.doc.lineAt(mathRange.to);
  ranges.push(Decoration.line({ attributes: { class: 'cm-line-math-block' } }).range(openingLine.from));
  ranges.push(
    Decoration.replace({
      inclusive: false,
      widget: new MarkdownMathWidget(mathRange)
    }).range(mathRange.from, openingLine.to)
  );
  for (let lineNumber = openingLine.number + 1; lineNumber <= closingLine.number; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    if (line.to > line.from) ranges.push(Decoration.replace({}).range(line.from, line.to));
  }
}
