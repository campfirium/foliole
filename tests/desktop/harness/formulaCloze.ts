import type { Page } from '@playwright/test';

export const TEX = '\\frac{a}{b}=c123123123';
export const FORMULA = `$$\n${TEX}\n$$`;

const MULTILINE_TEX = [
  '\\begin{aligned}',
  '\\mathcal{L}(\\theta,\\lambda)&=\\sum_{i=1}^{n}[y_i\\log\\sigma(x_i^T\\theta)+(1-y_i)\\log(1-\\sigma(x_i^T\\theta))]\\\\',
  '&-\\lambda\\left\\|\\int_0^T e^{-tA}\\left(\\frac{\\partial^2 f_\\theta}{\\partial x^2}(t,x)+\\nabla\\cdot g_\\theta(t,x)\\right)dt\\right\\|_2^2',
  '\\end{aligned}'
].join('\n');

export const MULTILINE_FORMULA = `$$\n${MULTILINE_TEX}\n$$`;

export function createFormulaClozeAnchor() {
  return {
    id: 'formula-region-playwright',
    kind: 'cloze' as const,
    locator: {
      display: 'block' as const,
      fallbackRect: { height: 0.34, width: 0.46, x: 0.22, y: 0.26 },
      formulaSource: FORMULA,
      kind: 'formula-region' as const,
      occurrenceKey: `block:0:${FORMULA.length}:${TEX}`,
      selection: {
        algorithm: 'katex-dom-leaf-v1' as const,
        fallbackRect: { height: 0.34, width: 0.46, x: 0.22, y: 0.26 },
        leaves: [{ path: [999], structureFingerprint: 'missing', textFingerprint: 'missing' }]
      }
    }
  };
}

export async function seedFormulaClozeWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(async ({ anchorLink, formula }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      { content: formula, id: 'playwright-formula-parent', kind: 'topic', title: 'Playwright Formula Parent' },
      {
        anchorLink,
        content: formula,
        id: 'playwright-formula-child',
        kind: 'item',
        parentNodeId: 'playwright-formula-parent',
        reveal: formula,
        title: 'Formula Cloze Child'
      }
    ]);
    await api?.openNode?.('playwright-formula-parent');
  }, { anchorLink: createFormulaClozeAnchor(), formula: FORMULA });
}

export async function collectFormulaRegionState(desktopWindow: Page) {
  return desktopWindow.evaluate(() => {
    const region = document.querySelector('.prompt-editor-host .cm-md-formula-cloze-region') as HTMLElement | null;
    const box = region?.getBoundingClientRect();
    const style = region ? getComputedStyle(region) : null;
    return {
      backgroundColor: style?.backgroundColor ?? null,
      borderStyle: style?.borderStyle ?? null,
      height: box?.height ?? 0,
      hidden: region?.dataset.mdFormulaRegionHidden ?? null,
      left: region?.style.left ?? null,
      opacity: style?.opacity ?? null,
      outlined: region?.dataset.mdFormulaRegionOutlined ?? null,
      top: region?.style.top ?? null,
      width: box?.width ?? 0
    };
  });
}

export async function installFormulaClozeCreateEventCounter(desktopWindow: Page) {
  await desktopWindow.evaluate(() => {
    const target = window as typeof window & { __formulaClozeCreateEventCount?: number };
    target.__formulaClozeCreateEventCount = 0;
    window.addEventListener('foliole:formula-cloze-create', () => {
      target.__formulaClozeCreateEventCount = (target.__formulaClozeCreateEventCount ?? 0) + 1;
    });
  });
}

export async function readFormulaClozeCreateEventCount(desktopWindow: Page) {
  return desktopWindow.evaluate(() => (window as typeof window & { __formulaClozeCreateEventCount?: number }).__formulaClozeCreateEventCount ?? 0);
}

export async function dragFormulaClozeRegion(desktopWindow: Page) {
  await desktopWindow.waitForSelector('.prompt-editor-host .cm-md-math-widget-block');
  const box = await desktopWindow.evaluate(() => {
    const getFormulaLeafRectsInPage = () => {
      const visualRoot = document.querySelector('.prompt-editor-host .cm-md-math-widget-block .katex-html');
      const leaves: Element[] = [];
      const visit = (element: Element) => {
        const children = Array.from(element.children).filter((child) => !child.classList.contains('strut'));
        if (children.length === 0) {
          leaves.push(element);
          return;
        }
        for (const child of children) visit(child);
      };
      if (visualRoot) visit(visualRoot);
      return leaves.map((leaf) => leaf.getBoundingClientRect()).filter((rect) => rect.width > 1 && rect.height > 1);
    };
    const rects = getFormulaLeafRectsInPage();
    if (rects.length === 0) return null;
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    return { height: bottom - top, width: right - left, x: left, y: top };
  });
  if (!box) throw new Error('missing formula widget box');
  await desktopWindow.mouse.move(box.x - 4, box.y - 4);
  await desktopWindow.mouse.down();
  await desktopWindow.mouse.move(box.x + box.width + 4, box.y + box.height + 4, { steps: 8 });
  await desktopWindow.mouse.up();
}

export async function dragFirstFormulaRowLeftRegion(desktopWindow: Page) {
  await desktopWindow.waitForSelector('.prompt-editor-host .cm-md-math-widget-block');
  const box = await desktopWindow.evaluate(() => {
    const getFormulaLeafRectsInPage = () => {
      const visualRoot = document.querySelector('.prompt-editor-host .cm-md-math-widget-block .katex-html');
      const leaves: Element[] = [];
      const visit = (element: Element) => {
        const children = Array.from(element.children).filter((child) => !child.classList.contains('strut'));
        if (children.length === 0) {
          leaves.push(element);
          return;
        }
        for (const child of children) visit(child);
      };
      if (visualRoot) visit(visualRoot);
      return leaves.map((leaf) => leaf.getBoundingClientRect()).filter((rect) => rect.width > 1 && rect.height > 1);
    };
    const widget = document.querySelector('.prompt-editor-host .cm-md-math-widget-block');
    const rects = getFormulaLeafRectsInPage();
    if (!widget || rects.length === 0) return null;
    const topRowTop = Math.min(...rects.map((rect) => rect.top));
    const rowRects = rects.filter((rect) => rect.top < topRowTop + 44);
    const left = Math.min(...rowRects.map((rect) => rect.left));
    const top = Math.min(...rowRects.map((rect) => rect.top));
    const right = left + Math.max(80, (Math.max(...rowRects.map((rect) => rect.right)) - left) * 0.26);
    const bottom = Math.max(...rowRects.map((rect) => rect.bottom));
    return { bottom, left, right, top, widgetHeight: widget.getBoundingClientRect().height };
  });
  if (!box) throw new Error('missing multiline formula row box');
  await desktopWindow.mouse.move(box.left - 4, box.top - 4);
  await desktopWindow.mouse.down();
  await desktopWindow.mouse.move(box.right + 4, box.bottom + 4, { steps: 8 });
  await desktopWindow.mouse.up();
  return box.widgetHeight;
}

export async function findFormulaClozeChildId(desktopWindow: Page) {
  return desktopWindow.evaluate(() => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    for (const { id } of api?.listNodes?.() ?? []) {
      const node = api?.getNode?.(id);
      if (node?.parentNodeId === 'playwright-formula-drag-parent' && node.anchorKind === 'cloze') return id;
    }
    return null;
  });
}

export async function collectFormulaClozeDebugState(desktopWindow: Page) {
  return desktopWindow.evaluate(() => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    return {
      activeNodeId: api?.getActiveNodeId?.() ?? null,
      clozeNodes: (api?.listNodes?.() ?? [])
        .map(({ id }) => api?.getNode?.(id))
        .filter((node) => node?.anchorKind === 'cloze')
        .map((node) => ({
          id: node!.id,
          parentNodeId: node!.parentNodeId,
          title: node!.title
        })),
      nodes: api?.listNodes?.() ?? []
    };
  });
}
