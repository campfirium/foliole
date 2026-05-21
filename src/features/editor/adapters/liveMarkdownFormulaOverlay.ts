import { FORMULA_CLOZE_CREATE_EVENT, type FormulaClozeCreateEventDetail } from '../../formula-cloze/model/formulaClozeEvents';
import type { FormulaClozeEditorPresentation } from '../../formula-cloze/model/formulaClozePresentation';
import {
  createFormulaDomSelectionDescriptor,
  measureFormulaDomSelectionDescriptor
} from '../model/formulaDomSelection';
import type { MarkdownMathRange } from '../model/markdownMathExtension';

export function configureFormulaOverlay(
  wrapper: HTMLElement,
  mathRange: MarkdownMathRange,
  presentation: FormulaClozeEditorPresentation | null
) {
  wrapper.classList.add('cm-md-math-widget-with-overlay');
  const overlay = document.createElement('span');
  overlay.className = 'cm-md-formula-cloze-overlay';
  wrapper.append(overlay);
  addSavedFormulaRegions(wrapper, overlay, mathRange, presentation);
  if (presentation?.canCreate) {
    attachFormulaSelectionHandlers(wrapper, overlay, mathRange);
  }
}

function addSavedFormulaRegions(
  wrapper: HTMLElement,
  overlay: HTMLElement,
  mathRange: MarkdownMathRange,
  presentation: FormulaClozeEditorPresentation | null
) {
  const occurrenceKey = buildFormulaOccurrenceKey(mathRange);
  for (const region of presentation?.regions ?? []) {
    if (region.occurrenceKey !== occurrenceKey) continue;
    const mask = document.createElement('span');
    mask.className = 'cm-md-formula-cloze-region';
    mask.dataset.mdFormulaRegionId = region.id;
    mask.dataset.mdFormulaRegionHidden = presentation?.hiddenRegionIds.includes(region.id) ? 'true' : 'false';
    mask.dataset.mdFormulaRegionOutlined = presentation?.outlinedRegionIds.includes(region.id) ? 'true' : 'false';
    setRegionRectStyle(mask, measureFormulaRegion(wrapper, region.selection) ?? region.fallbackRect);
    overlay.append(mask);
  }
}

function measureFormulaRegion(wrapper: HTMLElement, selection: FormulaClozeEditorPresentation['regions'][number]['selection']) {
  return measureFormulaDomSelectionDescriptor(wrapper, selection, (element) => {
    const box = element.getBoundingClientRect();
    return { height: box.height, width: box.width, x: box.left, y: box.top };
  });
}

function attachFormulaSelectionHandlers(wrapper: HTMLElement, overlay: HTMLElement, mathRange: MarkdownMathRange) {
  let start: { x: number; y: number } | null = null;
  let draft: HTMLElement | null = null;
  wrapper.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY };
    draft = document.createElement('span');
    draft.className = 'cm-md-formula-cloze-draft';
    overlay.append(draft);
    wrapper.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  wrapper.addEventListener('pointermove', (event) => {
    if (!start || !draft) return;
    setDraftRectStyle(draft, wrapper.getBoundingClientRect(), start, { x: event.clientX, y: event.clientY });
  });
  wrapper.addEventListener('pointerup', (event) => {
    if (!start || !draft) return;
    dispatchFormulaSelection(wrapper, draft, start, { x: event.clientX, y: event.clientY }, mathRange);
    draft = null;
    start = null;
  });
}

function dispatchFormulaSelection(
  wrapper: HTMLElement,
  draft: HTMLElement,
  start: { x: number; y: number },
  end: { x: number; y: number },
  mathRange: MarkdownMathRange
) {
  setDraftRectStyle(draft, wrapper.getBoundingClientRect(), start, end);
  const selectionRect = toViewportRect(start, end);
  draft.remove();
  const descriptor = createFormulaDomSelectionDescriptor(wrapper, selectionRect, (element) => {
    const box = element.getBoundingClientRect();
    return { height: box.height, width: box.width, x: box.left, y: box.top };
  });
  if (!descriptor) return;
  window.dispatchEvent(new CustomEvent<FormulaClozeCreateEventDetail>(FORMULA_CLOZE_CREATE_EVENT, {
    detail: {
      display: mathRange.display,
      formulaRange: { from: mathRange.from, to: mathRange.to },
      formulaSource: mathRange.source,
      occurrenceKey: buildFormulaOccurrenceKey(mathRange),
      selection: descriptor
    }
  }));
}

export function buildFormulaOccurrenceKey(mathRange: MarkdownMathRange) {
  return `${mathRange.display}:${mathRange.from}:${mathRange.to}:${mathRange.tex}`;
}

function setRegionRectStyle(element: HTMLElement, rect: { height: number; width: number; x: number; y: number }) {
  element.style.left = `${rect.x * 100}%`;
  element.style.top = `${rect.y * 100}%`;
  element.style.width = `${rect.width * 100}%`;
  element.style.height = `${rect.height * 100}%`;
}

function setDraftRectStyle(
  element: HTMLElement,
  rootRect: DOMRect,
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const rect = toViewportRect(start, end);
  setRegionRectStyle(element, {
    height: rect.height / rootRect.height,
    width: rect.width / rootRect.width,
    x: (rect.x - rootRect.left) / rootRect.width,
    y: (rect.y - rootRect.top) / rootRect.height
  });
}

function toViewportRect(start: { x: number; y: number }, end: { x: number; y: number }) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    height: Math.abs(end.y - start.y),
    width: Math.abs(end.x - start.x),
    x,
    y
  };
}
