export interface FormulaRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface FormulaDomSelectionLeaf {
  path: number[];
  structureFingerprint: string;
  textFingerprint: string;
}

export interface FormulaDomSelectionDescriptor {
  algorithm: 'katex-dom-leaf-v1';
  fallbackRect: FormulaRect;
  leaves: FormulaDomSelectionLeaf[];
}

type BoxProvider = (element: HTMLElement) => FormulaRect;

const ALGORITHM: FormulaDomSelectionDescriptor['algorithm'] = 'katex-dom-leaf-v1';

function intersects(left: FormulaRect, right: FormulaRect) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function unionRects(rects: readonly FormulaRect[]): FormulaRect {
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { height: maxY - minY, width: maxX - minX, x: minX, y: minY };
}

function toRelativeRect(rect: FormulaRect, rootRect: FormulaRect): FormulaRect {
  if (rootRect.width <= 0 || rootRect.height <= 0) return { height: 0, width: 0, x: 0, y: 0 };
  return {
    height: rect.height / rootRect.height,
    width: rect.width / rootRect.width,
    x: (rect.x - rootRect.x) / rootRect.width,
    y: (rect.y - rootRect.y) / rootRect.height
  };
}

function getElementChildren(element: HTMLElement) {
  return Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
}

function isIgnoredLeaf(element: HTMLElement) {
  return element.classList.contains('katex-mathml') || element.classList.contains('strut');
}

function collectLeafElements(element: HTMLElement, leaves: HTMLElement[]) {
  const children = getElementChildren(element).filter((child) => !isIgnoredLeaf(child));
  if (children.length === 0) {
    if (!isIgnoredLeaf(element)) leaves.push(element);
    return;
  }
  for (const child of children) collectLeafElements(child, leaves);
}

function resolveVisualRoot(root: HTMLElement) {
  return root.querySelector<HTMLElement>('.katex-html') ?? root;
}

function resolvePath(root: HTMLElement, leaf: HTMLElement) {
  const path: number[] = [];
  let current: HTMLElement | null = leaf;
  while (current && current !== root) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) break;
    path.unshift(getElementChildren(parent).indexOf(current));
    current = parent;
  }
  return path;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function createLeafDescriptor(visualRoot: HTMLElement, leaf: HTMLElement): FormulaDomSelectionLeaf {
  return {
    path: resolvePath(visualRoot, leaf),
    structureFingerprint: Array.from(leaf.classList).sort().join('.'),
    textFingerprint: normalizeText(leaf.textContent ?? '')
  };
}

export function listFormulaSelectionLeaves(root: HTMLElement): HTMLElement[] {
  const visualRoot = resolveVisualRoot(root);
  const leaves: HTMLElement[] = [];
  collectLeafElements(visualRoot, leaves);
  return leaves;
}

export function createFormulaDomSelectionDescriptor(
  root: HTMLElement,
  selectionRect: FormulaRect,
  getBox: BoxProvider
): FormulaDomSelectionDescriptor | null {
  const rootRect = getBox(root);
  const visualRoot = resolveVisualRoot(root);
  const selected = listFormulaSelectionLeaves(root).filter((leaf) => intersects(getBox(leaf), selectionRect));
  if (selected.length === 0) return null;
  const selectedRects = selected.map(getBox);
  return {
    algorithm: ALGORITHM,
    fallbackRect: toRelativeRect(unionRects(selectedRects), rootRect),
    leaves: selected.map((leaf) => createLeafDescriptor(visualRoot, leaf))
  };
}
