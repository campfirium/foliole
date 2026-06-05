import 'katex/dist/katex.min.css';

import type { Range } from '@codemirror/state';
import { Decoration, type EditorView, WidgetType } from '@codemirror/view';
import katex from 'katex';

import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';
import { getFormulaClozeEditorPresentation, type FormulaClozeEditorPresentation } from '../../formula-cloze/model/formulaClozePresentation';
import type { MarkdownMathRange } from '../model/markdownMathExtension';

import { configureFormulaOverlay } from './liveMarkdownFormulaOverlay';
import { isEditedMathRange, setEditedMathRangeEffect, type EditedMathRange } from './liveMarkdownMathEditState';

class MarkdownMathWidget extends WidgetType {
  readonly editorNodeId: string | null;
  readonly mathRange: MarkdownMathRange;
  readonly presentationVersion: number;

  constructor(mathRange: MarkdownMathRange, editorNodeId: string | null, presentationVersion: number) {
    super();
    this.editorNodeId = editorNodeId;
    this.mathRange = mathRange;
    this.presentationVersion = presentationVersion;
  }

  override eq(other: MarkdownMathWidget) {
    return (
      this.editorNodeId === other.editorNodeId &&
      this.mathRange.display === other.mathRange.display &&
      this.mathRange.from === other.mathRange.from &&
      this.mathRange.source === other.mathRange.source &&
      this.mathRange.tex === other.mathRange.tex &&
      this.mathRange.to === other.mathRange.to &&
      this.presentationVersion === other.presentationVersion
    );
  }

  override ignoreEvent() {
    return true;
  }

  override toDOM(view: EditorView) {
    const wrapper = document.createElement(this.mathRange.display === 'block' ? 'div' : 'span');
    wrapper.className = this.mathRange.display === 'block' ? 'cm-md-math-widget-block' : 'cm-md-math-widget-inline';
    wrapper.dataset.mdMathDisplay = this.mathRange.display;
    wrapper.dataset.mdMathFrom = String(this.mathRange.from);
    wrapper.dataset.mdMathPresentationVersion = String(this.presentationVersion);
    wrapper.dataset.mdMathTo = String(this.mathRange.to);
    wrapper.dataset.mdMathTex = this.mathRange.tex;
    renderMath(wrapper, this.mathRange, getFormulaClozeEditorPresentation(this.editorNodeId), () => {
      view.dispatch({
        effects: setEditedMathRangeEffect.of({ from: this.mathRange.from, to: this.mathRange.to }),
        selection: { anchor: Math.min(this.mathRange.from + 1, this.mathRange.to) },
        scrollIntoView: false
      });
      view.focus();
    });
    return wrapper;
  }

  override updateDOM(dom: HTMLElement) {
    if (
      dom.dataset.mdMathDisplay !== this.mathRange.display ||
      dom.dataset.mdMathFrom !== String(this.mathRange.from) ||
      dom.dataset.mdMathTo !== String(this.mathRange.to) ||
      dom.dataset.mdMathTex !== this.mathRange.tex ||
      dom.dataset.mdMathPresentationVersion !== String(this.presentationVersion)
    ) {
      return false;
    }
    return true;
  }
}

function preventPreviewCaretPlacement(wrapper: HTMLElement) {
  wrapper.addEventListener('pointerdown', (event) => {
    if (event.defaultPrevented) return;
    if (event.target instanceof HTMLElement && event.target.closest('.cm-md-math-source-button')) return;
    event.preventDefault();
  });
}

function renderMath(
  wrapper: HTMLElement,
  mathRange: MarkdownMathRange,
  presentation: FormulaClozeEditorPresentation | null,
  onEditSource: () => void
) {
  try {
    katex.render(mathRange.tex, wrapper, {
      displayMode: mathRange.display === 'block',
      output: 'htmlAndMathml',
      strict: 'warn',
      throwOnError: false,
      trust: false
    });
    configureFormulaOverlay(wrapper, mathRange, presentation);
    preventPreviewCaretPlacement(wrapper);
    wrapper.append(createFormulaSourceButton(onEditSource));
  } catch {
    wrapper.classList.add('cm-md-math-widget-error');
    wrapper.textContent = mathRange.source;
  }
}

function createFormulaSourceButton(onEditSource: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cm-md-math-source-button';
  button.ariaLabel = translate(getStoredAppLocale(), 'desktop.editor.formula.editSource');
  button.textContent = 'TeX';
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onEditSource();
  });
  return button;
}

export function addMathDecorations(
  ranges: Range<Decoration>[],
  mathRanges: ReadonlyArray<MarkdownMathRange>,
  view: EditorView,
  editedMathRange: EditedMathRange | null,
  editorNodeId: string | null,
  presentationVersion: number
) {
  for (const mathRange of mathRanges) {
    if (isEditedMathRange(editedMathRange, mathRange.from, mathRange.to)) continue;
    if (mathRange.display === 'block') {
      addBlockMathDecorations(ranges, mathRange, view, editorNodeId, presentationVersion);
      continue;
    }
    ranges.push(
      Decoration.replace({
        inclusive: false,
        widget: new MarkdownMathWidget(mathRange, editorNodeId, presentationVersion)
      }).range(mathRange.from, mathRange.to)
    );
  }
}

function addBlockMathDecorations(
  ranges: Range<Decoration>[],
  mathRange: MarkdownMathRange,
  view: EditorView,
  editorNodeId: string | null,
  presentationVersion: number
) {
  const openingLine = view.state.doc.lineAt(mathRange.from);
  const closingLine = view.state.doc.lineAt(mathRange.to);
  ranges.push(Decoration.line({ attributes: { class: 'cm-line-math-block' } }).range(openingLine.from));
  ranges.push(
    Decoration.replace({
      inclusive: false,
      widget: new MarkdownMathWidget(mathRange, editorNodeId, presentationVersion)
    }).range(mathRange.from, openingLine.to)
  );
  for (let lineNumber = openingLine.number + 1; lineNumber <= closingLine.number; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    ranges.push(Decoration.line({ attributes: { class: 'cm-line-math-source-hidden' } }).range(line.from));
    if (line.to > line.from) ranges.push(Decoration.replace({}).range(line.from, line.to));
  }
}
