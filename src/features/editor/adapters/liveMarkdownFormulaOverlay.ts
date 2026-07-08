import { FORMULA_CLOZE_CREATE_EVENT, type FormulaClozeCreateEventDetail } from '../../formula-cloze/model/formulaClozeEvents';
import type { FormulaClozeEditorPresentation } from '../../formula-cloze/model/formulaClozePresentation';
import { createFormulaDomSelectionDescriptor } from '../model/formulaDomSelection';
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
  if (presentation?.canCreate !== false) {
    attachFormulaSelectionHandlers(wrapper, overlay, mathRange);
  }
}

function addSavedFormulaRegions(
  wrapper: HTMLElement,
  overlay: HTMLElement,
  mathRange: MarkdownMathRange,
  presentation: FormulaClozeEditorPresentation | null
) {
  if (!presentation) return;
  const occurrenceKey = buildFormulaOccurrenceKey(mathRange);
  for (const region of presentation.regions) {
    if (!doesRegionMatchMathRange(region, mathRange, occurrenceKey, presentation)) continue;
    const mask = document.createElement('span');
    mask.className = 'cm-md-formula-cloze-region';
    mask.dataset.mdFormulaRegionId = region.id;
    mask.dataset.mdFormulaRegionHidden = presentation?.hiddenRegionIds.includes(region.id) ? 'true' : 'false';
    mask.dataset.mdFormulaRegionOutlined = presentation?.outlinedRegionIds.includes(region.id) ? 'true' : 'false';
    const fallbackRect = getWrapperRectFromVisualRect(wrapper, region.fallbackRect);
    setRegionRectStyle(mask, isUsableFormulaRect(fallbackRect) ? fallbackRect : region.fallbackRect);
    overlay.append(mask);
  }
}

function isUsableFormulaRect(rect: { height: number; width: number; x: number; y: number } | null) {
  return Boolean(
    rect &&
    Number.isFinite(rect.height) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    rect.height > 0 &&
    rect.width > 0
  );
}

function doesRegionMatchMathRange(
  region: FormulaClozeEditorPresentation['regions'][number],
  mathRange: MarkdownMathRange,
  occurrenceKey: string,
  presentation: FormulaClozeEditorPresentation
) {
  if (region.occurrenceKey === occurrenceKey) return true;
  return (
    !presentation.canCreate &&
    region.display === mathRange.display &&
    getFormulaSourceTex(region.formulaSource) === normalizeFormulaText(mathRange.tex)
  );
}

function getFormulaSourceTex(source: string) {
  const trimmed = source.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) return normalizeFormulaText(trimmed.slice(2, -2));
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) return normalizeFormulaText(trimmed.slice(2, -2));
  if (trimmed.startsWith('$') && trimmed.endsWith('$')) return normalizeFormulaText(trimmed.slice(1, -1));
  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) return normalizeFormulaText(trimmed.slice(2, -2));
  return normalizeFormulaText(trimmed);
}

function normalizeFormulaText(value: string) {
  return value.replace(/\r\n/g, '\n').trim();
}

function findFormulaVisualRoot(wrapper: HTMLElement) {
  return wrapper.querySelector<HTMLElement>('.katex-html') ?? wrapper.querySelector<HTMLElement>('.katex');
}

function isPointInsideElement(element: HTMLElement, point: { x: number; y: number }) {
  const box = element.getBoundingClientRect();
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
}

function canStartFormulaSelection(wrapper: HTMLElement, event: MouseEvent | PointerEvent) {
  if (event.target instanceof HTMLElement && event.target.closest('.cm-md-math-source-button')) return false;
  const visualRoot = findFormulaVisualRoot(wrapper);
  if (visualRoot && isPointInsideElement(visualRoot, { x: event.clientX, y: event.clientY })) return true;
  return isPointInsideElement(wrapper, { x: event.clientX, y: event.clientY });
}

function attachFormulaSelectionHandlers(wrapper: HTMLElement, overlay: HTMLElement, mathRange: MarkdownMathRange) {
  let start: { x: number; y: number } | null = null;
  let draft: HTMLElement | null = null;
  const removeWindowMouseHandlers = () => {
    window.removeEventListener('mousemove', handleSelectionMove, { capture: true });
    window.removeEventListener('mouseup', handleSelectionEnd, { capture: true });
  };
  const handleSelectionStart = (event: MouseEvent | PointerEvent) => {
    if (start) return;
    if (event.button !== 0) return;
    if (!canStartFormulaSelection(wrapper, event)) return;
    start = { x: event.clientX, y: event.clientY };
    draft = document.createElement('span');
    draft.className = 'cm-md-formula-cloze-draft';
    overlay.append(draft);
    if ('pointerId' in event) wrapper.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };
  const handleSelectionMove = (event: MouseEvent | PointerEvent) => {
    if (!start || !draft) return;
    setDraftRectStyle(draft, wrapper.getBoundingClientRect(), start, { x: event.clientX, y: event.clientY });
    event.preventDefault();
    event.stopPropagation();
  };
  const handleSelectionEnd = (event: MouseEvent | PointerEvent) => {
    if (!start || !draft) return;
    dispatchFormulaSelection(wrapper, draft, start, { x: event.clientX, y: event.clientY }, mathRange);
    draft = null;
    start = null;
    removeWindowMouseHandlers();
    event.preventDefault();
    event.stopPropagation();
  };
  const resetDraft = () => {
    draft?.remove();
    draft = null;
    start = null;
    removeWindowMouseHandlers();
  };
  const handleMouseDown = (event: MouseEvent) => {
    handleSelectionStart(event);
    if (!start) return;
    window.addEventListener('mousemove', handleSelectionMove, { capture: true });
    window.addEventListener('mouseup', handleSelectionEnd, { capture: true });
  };
  wrapper.addEventListener('pointerdown', handleSelectionStart, { capture: true });
  wrapper.addEventListener('pointermove', handleSelectionMove, { capture: true });
  wrapper.addEventListener('pointerup', handleSelectionEnd, { capture: true });
  wrapper.addEventListener('pointercancel', resetDraft, { capture: true });
  wrapper.addEventListener('mousedown', handleMouseDown, { capture: true });
  wrapper.addEventListener('mousemove', handleSelectionMove, { capture: true });
  wrapper.addEventListener('mouseup', handleSelectionEnd, { capture: true });
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
  if (selectionRect.width < 3 || selectionRect.height < 3) return;
  const visualRoot = findFormulaVisualRoot(wrapper);
  if (!visualRoot) return;
  const descriptor = createFormulaDomSelectionDescriptor(visualRoot, selectionRect, (element) => {
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

function buildFormulaOccurrenceKey(mathRange: MarkdownMathRange) {
  return `${mathRange.display}:${mathRange.from}:${mathRange.to}:${mathRange.tex}`;
}

function setRegionRectStyle(element: HTMLElement, rect: { height: number; width: number; x: number; y: number }) {
  element.style.left = `${rect.x * 100}%`;
  element.style.top = `${rect.y * 100}%`;
  element.style.width = `${rect.width * 100}%`;
  element.style.height = `${rect.height * 100}%`;
}

function getWrapperRectFromVisualRect(wrapper: HTMLElement, rect: { height: number; width: number; x: number; y: number }) {
  const visualRoot = findFormulaVisualRoot(wrapper);
  if (!visualRoot) return rect;
  const wrapperBox = wrapper.getBoundingClientRect();
  const visualBox = visualRoot.getBoundingClientRect();
  if (wrapperBox.width <= 0 || wrapperBox.height <= 0) return rect;
  return {
    height: rect.height * visualBox.height / wrapperBox.height,
    width: rect.width * visualBox.width / wrapperBox.width,
    x: (visualBox.left - wrapperBox.left + rect.x * visualBox.width) / wrapperBox.width,
    y: (visualBox.top - wrapperBox.top + rect.y * visualBox.height) / wrapperBox.height
  };
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
