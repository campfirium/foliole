import katex from 'katex';
import { describe, expect, it } from 'vitest';

import {
  createFormulaDomSelectionDescriptor,
  listFormulaSelectionLeaves,
  type FormulaRect
} from './formulaDomSelection';

function renderFormula(tex: string) {
  const root = document.createElement('span');
  katex.render(tex, root, { displayMode: false, throwOnError: false, trust: false });
  return root;
}

function rect(x: number, y: number, width: number, height: number): FormulaRect {
  return { height, width, x, y };
}

describe('formulaDomSelection', () => {
  it('creates descriptors from selected KaTeX leaves and relative fallback rects', () => {
    const root = renderFormula('x^{2}+y');
    const leaves = listFormulaSelectionLeaves(root);
    const xLeaf = leaves.find((leaf) => leaf.textContent === 'x');
    const exponentLeaf = leaves.find((leaf) => leaf.textContent === '2');
    expect(xLeaf).toBeTruthy();
    expect(exponentLeaf).toBeTruthy();

    const boxes = new WeakMap<HTMLElement, FormulaRect>([
      [root, rect(10, 20, 100, 50)],
      [xLeaf as HTMLElement, rect(20, 30, 10, 10)],
      [exponentLeaf as HTMLElement, rect(32, 24, 8, 8)]
    ]);
    const descriptor = createFormulaDomSelectionDescriptor(root, rect(18, 22, 24, 20), (element) =>
      boxes.get(element) ?? rect(200, 200, 1, 1)
    );

    expect(descriptor).toEqual(expect.objectContaining({
      algorithm: 'katex-dom-leaf-v1',
      fallbackRect: { height: 0.32, width: 0.2, x: 0.1, y: 0.08 }
    }));
    expect(descriptor?.leaves.map((leaf) => leaf.textFingerprint)).toEqual(expect.arrayContaining(['x', '2']));
    expect(descriptor?.leaves.every((leaf) => leaf.path.length > 0)).toBe(true);
  });

  it('returns null when the selection does not intersect formula leaves', () => {
    const root = renderFormula('\\frac{1}{2}');
    const descriptor = createFormulaDomSelectionDescriptor(root, rect(500, 500, 20, 20), () => rect(0, 0, 100, 30));
    expect(descriptor).toBeNull();
  });
});
