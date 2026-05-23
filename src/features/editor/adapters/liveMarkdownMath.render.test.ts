import { EditorView } from '@codemirror/view';
import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FORMULA_CLOZE_CREATE_EVENT } from '../../formula-cloze/model/formulaClozeEvents';
import {
  registerFormulaClozeEditorPresentation,
  unregisterFormulaClozeEditorPresentation
} from '../../formula-cloze/model/formulaClozePresentation';
import { listFormulaSelectionLeaves } from '../model/formulaDomSelection';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createAdapterHost(initialContent: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent });
  return { adapter, host };
}

function mockRect(element: HTMLElement, rect: { height: number; width: number; x: number; y: number }) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      bottom: rect.y + rect.height,
      height: rect.height,
      left: rect.x,
      right: rect.x + rect.width,
      top: rect.y,
      width: rect.width,
      x: rect.x,
      y: rect.y
    })
  });
}

function dispatchPointerEvent(target: HTMLElement, type: string, point: { x: number; y: number }) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX: point.x,
    clientY: point.y
  });
  target.dispatchEvent(event);
  return event;
}

function getAdapterView(adapter: CodeMirrorEditorAdapter) {
  return (adapter as unknown as { view: EditorView }).view;
}

function getAtomicRangeSpans(view: EditorView) {
  const spans: Array<{ from: number; to: number }> = [];
  for (const provider of view.state.facet(EditorView.atomicRanges)) {
    provider(view).between(0, view.state.doc.length, (from, to) => {
      spans.push({ from, to });
    });
  }
  return spans;
}

async function expectInlineAndBlockMathWidgets() {
  const { adapter, host } = createAdapterHost('Inline $E=mc^2$\n\n$$\na^2+b^2=c^2\n$$');

  await waitFor(() => {
    expect(host.querySelectorAll('.cm-md-math-widget-inline .katex').length).toBe(1);
    expect(host.querySelectorAll('.cm-md-math-widget-block .katex-display').length).toBe(1);
  });
  expect(host.querySelector('.cm-md-math-widget-inline')).toHaveAttribute('data-md-math-tex', 'E=mc^2');
  expect(host.querySelector('.cm-md-math-widget-block')).toHaveAttribute('data-md-math-tex', 'a^2+b^2=c^2');

  adapter.destroy();
}

async function expectInvalidFormulaFallback() {
  const { adapter, host } = createAdapterHost('Broken $\\notacommand$');

  await waitFor(() => {
    expect(host.querySelector('.cm-md-math-widget-inline')).not.toBeNull();
  });
  expect(host.textContent).toContain('\\notacommand');

  adapter.destroy();
}

async function expectFormulaClickKeepsRenderedWidget() {
  const content = 'Before $E=mc^2$ after';
  const from = content.indexOf('$E=mc^2$');
  const { adapter, host } = createAdapterHost(content);

  await waitFor(() => {
    expect(host.querySelector('.cm-md-math-widget-inline .katex')).not.toBeNull();
  });
  adapter.setSelection({ from: from + 2, to: from + 2 });

  await waitFor(() => {
    expect(host.querySelector('.cm-md-math-widget-inline .katex')).not.toBeNull();
  });

  adapter.destroy();
}

async function expectFormulaSourceButtonRevealsSource() {
  const content = 'Before $E=mc^2$ after';
  const from = content.indexOf('$E=mc^2$');
  const to = from + '$E=mc^2$'.length;
  const { adapter, host } = createAdapterHost(content);

  await waitFor(() => {
    expect(host.querySelector('.cm-md-math-source-button')).not.toBeNull();
  });
  expect(getAtomicRangeSpans(getAdapterView(adapter))).toContainEqual({ from, to });
  host.querySelector<HTMLButtonElement>('.cm-md-math-source-button')!.click();

  await waitFor(() => {
    expect(host.querySelector('.cm-md-math-widget-inline')).toBeNull();
  });
  expect(host.textContent).toContain('$E=mc^2$');
  expect(host.querySelector('.cm-line-math-source')?.textContent).toContain('$E=mc^2$');
  expect(host.querySelector('.cm-md-math-source-delimiter')?.textContent).toBe('$');
  expect(host.querySelector('.cm-md-math-source-operator')?.textContent).toBe('=');
  expect(getAtomicRangeSpans(getAdapterView(adapter))).not.toContainEqual({ from, to });

  adapter.destroy();
}

async function expectRenderedFormulaClickDoesNotPlaceCaret() {
  const { adapter, host } = createAdapterHost('Before\n\n$$\n\\frac{a}{b}=c\n$$\n\nAfter');

  await waitFor(() => {
    expect(host.querySelector('.cm-md-math-widget-block .katex-display')).not.toBeNull();
  });
  const wrapper = host.querySelector<HTMLElement>('.cm-md-math-widget-block')!;
  const event = dispatchPointerEvent(wrapper, 'pointerdown', { x: 120, y: 80 });

  expect(event.defaultPrevented).toBe(true);

  adapter.destroy();
}

async function expectCollapsedDeleteOutsideFormulaDoesNotRemoveFormula() {
  const content = 'Before\n\n$$\n\\frac{a}{b}=c\n$$\n\nAfter';
  const from = content.indexOf('$$');
  const to = content.lastIndexOf('$$') + '$$'.length;
  const { adapter, host } = createAdapterHost(content);
  const view = getAdapterView(adapter);

  await waitFor(() => {
    expect(host.querySelector('.cm-md-math-widget-block .katex-display')).not.toBeNull();
  });
  adapter.setSelection({ from: to, to });
  view.dispatch({ changes: { from, to, insert: '' } });

  expect(view.state.doc.toString()).toBe(content);
  expect(host.querySelector('.cm-md-math-widget-block .katex-display')).not.toBeNull();

  adapter.destroy();
}

async function expectSavedFormulaClozeRegions() {
  const content = 'Inline $E=mc^2$';
  const from = content.indexOf('$E=mc^2$');
  const to = from + '$E=mc^2$'.length;
  const { adapter, host } = createAdapterHost(content);
  adapter.setNodeId('node-1');

  registerFormulaClozeEditorPresentation('node-1', {
    canCreate: true,
    hiddenRegionIds: ['formula-region-1'],
    outlinedRegionIds: [],
    regions: [
      {
        display: 'inline',
        fallbackRect: { height: 0.4, width: 0.3, x: 0.1, y: 0.2 },
        formulaSource: '$E=mc^2$',
        id: 'formula-region-1',
        occurrenceKey: `inline:${from}:${to}:E=mc^2`,
        selection: {
          algorithm: 'katex-dom-leaf-v1',
          fallbackRect: { height: 0.4, width: 0.3, x: 0.1, y: 0.2 },
          leaves: [{ path: [0], structureFingerprint: 'mord', textFingerprint: 'E=mc2' }]
        }
      }
    ]
  });
  adapter.refreshImageClozePresentation();

  await waitFor(() => {
    expect(host.querySelector('.cm-md-formula-cloze-region')).toHaveAttribute('data-md-formula-region-hidden', 'true');
  });

  adapter.destroy();
}

async function expectFormulaSelectionStartsFromVisualContent() {
  const content = 'Before\n\n$$\n\\frac{a}{b}=c\n$$';
  const { adapter, host } = createAdapterHost(content);
  adapter.setNodeId('node-1');
  registerFormulaClozeEditorPresentation('node-1', {
    canCreate: true,
    hiddenRegionIds: [],
    outlinedRegionIds: [],
    regions: []
  });
  adapter.refreshImageClozePresentation();

  await waitFor(() => {
    expect(host.querySelector('.cm-md-math-widget-block .katex-html')).not.toBeNull();
  });

  const wrapper = host.querySelector<HTMLElement>('.cm-md-math-widget-block')!;
  const visualRoot = wrapper.querySelector<HTMLElement>('.katex-html')!;
  mockRect(wrapper, { height: 200, width: 1000, x: 0, y: 0 });
  mockRect(visualRoot, { height: 80, width: 200, x: 400, y: 60 });
  for (const leaf of listFormulaSelectionLeaves(wrapper)) {
    mockRect(leaf, { height: 24, width: 36, x: 420, y: 72 });
  }

  const created: Event[] = [];
  const listener = (event: Event) => created.push(event);
  window.addEventListener(FORMULA_CLOZE_CREATE_EVENT, listener);

  dispatchPointerEvent(wrapper, 'pointerdown', { x: 40, y: 40 });
  dispatchPointerEvent(wrapper, 'pointerup', { x: 120, y: 90 });
  expect(created).toHaveLength(0);

  dispatchPointerEvent(visualRoot, 'pointerdown', { x: 410, y: 64 });
  dispatchPointerEvent(wrapper, 'pointerup', { x: 460, y: 100 });
  expect(created).toHaveLength(1);
  expect((created[0] as CustomEvent).detail.selection.fallbackRect).toEqual({
    height: 0.3,
    width: 0.18,
    x: 0.1,
    y: 0.15
  });

  window.removeEventListener(FORMULA_CLOZE_CREATE_EVENT, listener);
  adapter.destroy();
}

describe('live Markdown math rendering', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    unregisterFormulaClozeEditorPresentation('node-1');
  });

  it('renders inline and block math with KaTeX widgets', expectInlineAndBlockMathWidgets);
  it('keeps unsafe or invalid formulas readable instead of throwing', expectInvalidFormulaFallback);
  it('keeps formulas rendered when the cursor enters formula source ranges', expectFormulaClickKeepsRenderedWidget);
  it('reveals formula source only from the formula source button', expectFormulaSourceButtonRevealsSource);
  it('prevents rendered formula clicks from placing an editor caret', expectRenderedFormulaClickDoesNotPlaceCaret);
  it('does not remove a rendered formula from a collapsed cursor outside the formula', expectCollapsedDeleteOutsideFormulaDoesNotRemoveFormula);
  it('renders saved formula cloze presentation regions on matching formula occurrences', expectSavedFormulaClozeRegions);
  it('starts visual formula cloze selection only from rendered KaTeX content', expectFormulaSelectionStartsFromVisualContent);
});
