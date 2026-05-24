import katex from 'katex';
import { describe, expect, it } from 'vitest';

import type { FormulaRegionRect } from '../../nodes/model/nodeTypes';

import {
  createFormulaDomSelectionDescriptor,
  listFormulaSelectionLeaves,
  measureFormulaDomSelectionDescriptor
} from './formulaDomSelection';

function renderFormula(tex: string) {
  const root = document.createElement('span');
  katex.render(tex, root, { displayMode: false, throwOnError: false, trust: false });
  return root;
}

function rect(x: number, y: number, width: number, height: number): FormulaRegionRect {
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

    const boxes = new WeakMap<HTMLElement, FormulaRegionRect>([
      [root, rect(10, 20, 100, 50)],
      [xLeaf as HTMLElement, rect(20, 30, 10, 10)],
      [exponentLeaf as HTMLElement, rect(32, 24, 8, 8)]
    ]);
    const descriptor = createFormulaDomSelectionDescriptor(root, rect(18, 22, 24, 20), (element) =>
      boxes.get(element) ?? rect(200, 200, 1, 1)
    );

    expect(descriptor).toEqual(expect.objectContaining({
      algorithm: 'katex-dom-leaf-v1',
      fallbackRect: { height: 0.4, width: 0.24, x: 0.08, y: 0.04 }
    }));
    expect(descriptor?.leaves.map((leaf) => leaf.textFingerprint)).toEqual(expect.arrayContaining(['x', '2']));
    expect(descriptor?.leaves.every((leaf) => leaf.path.length > 0)).toBe(true);
  });

  it('remeasures a saved descriptor against the current KaTeX DOM', () => {
    const root = renderFormula('x^{2}+y');
    const leaves = listFormulaSelectionLeaves(root);
    const xLeaf = leaves.find((leaf) => leaf.textContent === 'x') as HTMLElement;
    const exponentLeaf = leaves.find((leaf) => leaf.textContent === '2') as HTMLElement;
    const initialBoxes = new WeakMap<HTMLElement, FormulaRegionRect>([
      [root, rect(10, 20, 100, 50)],
      [xLeaf, rect(20, 30, 10, 10)],
      [exponentLeaf, rect(32, 24, 8, 8)]
    ]);
    const descriptor = createFormulaDomSelectionDescriptor(root, rect(18, 22, 24, 20), (element) =>
      initialBoxes.get(element) ?? rect(200, 200, 1, 1)
    );
    expect(descriptor).not.toBeNull();

    const nextBoxes = new WeakMap<HTMLElement, FormulaRegionRect>([
      [root, rect(100, 200, 200, 100)],
      [xLeaf, rect(130, 240, 20, 20)],
      [exponentLeaf, rect(155, 220, 10, 10)]
    ]);

    expect(measureFormulaDomSelectionDescriptor(root, descriptor!, (element) => nextBoxes.get(element) ?? rect(0, 0, 1, 1))).toEqual({
      height: 0.4,
      width: 0.175,
      x: 0.15,
      y: 0.2
    });
  });

  it('returns null when the selection does not intersect formula leaves', () => {
    const root = renderFormula('\\frac{1}{2}');
    const descriptor = createFormulaDomSelectionDescriptor(root, rect(500, 500, 20, 20), () => rect(0, 0, 100, 30));
    expect(descriptor).toBeNull();
  });
});
