import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FORMULA_CLOZE_CREATE_EVENT } from '../../formula-cloze/model/formulaClozeEvents';
import {
  registerFormulaClozeEditorPresentation,
  unregisterFormulaClozeEditorPresentation
} from '../../formula-cloze/model/formulaClozePresentation';
import { listFormulaSelectionLeaves } from '../model/formulaDomSelection';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

const RELEASE_GATE_WAIT_OPTIONS = { timeout: 15_000 };

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

function dispatchPointerEvent(target: EventTarget, type: string, point: { x: number; y: number }) {
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

function dispatchMouseEvent(target: EventTarget, type: string, point: { x: number; y: number }) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    buttons: type === 'mouseup' ? 0 : 1,
    cancelable: true,
    clientX: point.x,
    clientY: point.y
  });
  target.dispatchEvent(event);
  return event;
}

async function createFormulaClozeHost(registerPresentation = true) {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent: 'Before\n\n$$\n\\frac{a}{b}=c\n$$' });
  adapter.setNodeId('node-1');
  if (registerPresentation) {
    registerFormulaClozeEditorPresentation('node-1', {
      canCreate: true,
      hiddenRegionIds: [],
      outlinedRegionIds: [],
      regions: []
    });
    adapter.refreshImageClozePresentation();
  }

  await waitFor(() => {
    expect(host.querySelector('.cm-md-math-widget-block .katex-html')).not.toBeNull();
  }, RELEASE_GATE_WAIT_OPTIONS);
  return { adapter, host };
}

function mockFormulaGeometry(wrapper: HTMLElement, visualRoot: HTMLElement) {
  mockRect(wrapper, { height: 200, width: 1000, x: 0, y: 0 });
  mockRect(visualRoot, { height: 80, width: 200, x: 400, y: 60 });
  for (const leaf of listFormulaSelectionLeaves(wrapper)) mockRect(leaf, { height: 24, width: 36, x: 420, y: 72 });
}

async function expectPointerDragCreatesFormulaRegion() {
  const { adapter, host } = await createFormulaClozeHost();
  const wrapper = host.querySelector<HTMLElement>('.cm-md-math-widget-block')!;
  const visualRoot = wrapper.querySelector<HTMLElement>('.katex-html')!;
  const created: Event[] = [];
  const listener = (event: Event) => created.push(event);
  const leakedPointerDown: Event[] = [];
  mockFormulaGeometry(wrapper, visualRoot);
  window.addEventListener(FORMULA_CLOZE_CREATE_EVENT, listener);
  wrapper.parentElement?.addEventListener('pointerdown', (event) => leakedPointerDown.push(event));

  dispatchPointerEvent(wrapper, 'pointerdown', { x: 40, y: 40 });
  dispatchPointerEvent(wrapper, 'pointerup', { x: 120, y: 90 });
  const visualPointerDown = dispatchPointerEvent(visualRoot, 'pointerdown', { x: 410, y: 64 });
  dispatchPointerEvent(wrapper, 'pointerup', { x: 460, y: 100 });
  const wrapperPointerDown = dispatchPointerEvent(wrapper, 'pointerdown', { x: 410, y: 64 });
  dispatchPointerEvent(wrapper, 'pointerup', { x: 460, y: 100 });

  expect(created).toHaveLength(2);
  expect(visualPointerDown.defaultPrevented).toBe(true);
  expect(wrapperPointerDown.defaultPrevented).toBe(true);
  expect(leakedPointerDown).toHaveLength(0);
  expect((created[1] as CustomEvent).detail.selection.fallbackRect).toEqual({
    height: 0.45,
    width: 0.25,
    x: 0.05,
    y: 0.05
  });
  window.removeEventListener(FORMULA_CLOZE_CREATE_EVENT, listener);
  adapter.destroy();
}

async function expectFormulaRegionCreationBeforePresentation() {
  const { adapter, host } = await createFormulaClozeHost(false);
  const wrapper = host.querySelector<HTMLElement>('.cm-md-math-widget-block')!;
  const visualRoot = wrapper.querySelector<HTMLElement>('.katex-html')!;
  const created: Event[] = [];
  const listener = (event: Event) => created.push(event);
  mockFormulaGeometry(wrapper, visualRoot);
  window.addEventListener(FORMULA_CLOZE_CREATE_EVENT, listener);

  dispatchPointerEvent(wrapper, 'pointerdown', { x: 410, y: 64 });
  dispatchPointerEvent(wrapper, 'pointerup', { x: 460, y: 100 });

  expect(created).toHaveLength(1);
  window.removeEventListener(FORMULA_CLOZE_CREATE_EVENT, listener);
  adapter.destroy();
}

async function expectMouseDragCreatesFormulaRegion() {
  const { adapter, host } = await createFormulaClozeHost();
  const wrapper = host.querySelector<HTMLElement>('.cm-md-math-widget-block')!;
  const visualRoot = wrapper.querySelector<HTMLElement>('.katex-html')!;
  const created: Event[] = [];
  const listener = (event: Event) => created.push(event);
  mockFormulaGeometry(wrapper, visualRoot);
  window.addEventListener(FORMULA_CLOZE_CREATE_EVENT, listener);

  const mouseDown = dispatchMouseEvent(visualRoot, 'mousedown', { x: 410, y: 64 });
  dispatchMouseEvent(window, 'mousemove', { x: 440, y: 84 });
  dispatchMouseEvent(window, 'mouseup', { x: 460, y: 100 });

  expect(created).toHaveLength(1);
  expect(mouseDown.defaultPrevented).toBe(true);
  expect((created[0] as CustomEvent).detail.selection.fallbackRect).toEqual({
    height: 0.45,
    width: 0.25,
    x: 0.05,
    y: 0.05
  });
  window.removeEventListener(FORMULA_CLOZE_CREATE_EVENT, listener);
  adapter.destroy();
}

describe('live Markdown formula cloze selection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    unregisterFormulaClozeEditorPresentation('node-1');
  });

  it('creates a region when dragging from formula coordinates even if the event target is the wrapper', expectPointerDragCreatesFormulaRegion);
  it('keeps formula region creation available before presentation state is registered', expectFormulaRegionCreationBeforePresentation);
  it('creates a region from mouse drag events used by desktop automation', expectMouseDragCreatesFormulaRegion);
});
