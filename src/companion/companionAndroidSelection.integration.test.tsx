import { EditorView } from '@codemirror/view';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';

import { CompanionArticleDocument } from './CompanionArticleDocument';
import { CompanionDevanagariSelectionControl } from './CompanionDevanagariSelectionControl';
import { CompanionSelectionAnnotationToolbar } from './CompanionSelectionAnnotationToolbar';
import { resolveCompanionSelectionCommandPayload } from './companionSelectionCommandPayload';
import { useCompanionSelectionAnnotationToolbar } from './useCompanionSelectionAnnotationToolbar';

const platform = vi.hoisted(() => ({ value: 'android' }));
vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => true, getPlatform: () => platform.value } };
});

const body = 'क्षत्र क्षत्र';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  platform.value = 'android';
});

function openDocument(editable = false, content = body) {
  const ready: { adapter?: EditorAdapter } = {};
  const { container } = render(<MouseGestureSettingsProvider><CompanionArticleDocument content={content} nodeId="source"
    onEditorReady={value => { if (value) ready.adapter = value; }} {...(editable ? { onChange: () => {} } : {})} /></MouseGestureSettingsProvider>);
  const view = EditorView.findFromDOM(container.querySelector('.cm-editor')!)!;
  return { adapter: ready.adapter!, view, text: view.contentDOM.querySelector('.cm-line')!.firstChild! };
}

it.each([
  { platformName: 'android', editable: false, expectedFrom: 9 },
  { platformName: 'android', editable: true, expectedFrom: 7 },
  { platformName: 'ios', editable: false, expectedFrom: 7 }
])('preserves the appropriate pointer range on $platformName (editable $editable)', ({ platformName, editable, expectedFrom }) => {
  platform.value = platformName;
  const { view, text } = openDocument(editable);
  const selection = window.getSelection()!;
  selection.setBaseAndExtent(text, 9, text, 13);
  const collapse = vi.spyOn(selection, 'collapse');
  const extend = vi.spyOn(selection, 'extend');
  view.dispatch({ selection: { anchor: 9, head: 13 }, userEvent: 'select.pointer' });
  expect(view.state.selection.main.from).toBe(expectedFrom);
  expect(selection.anchorOffset).toBe(expectedFrom);
  expect(collapse).toHaveBeenCalledTimes(expectedFrom === 9 ? 0 : 1);
  expect(extend).toHaveBeenCalledTimes(expectedFrom === 9 ? 0 : 1);
});

it('anchors a reverse selection to the second occurrence and completes both conjuncts', () => {
  const { adapter, text } = openDocument();
  const native = window.getSelection()!;
  native.setBaseAndExtent(text, 12, text, 9);
  const collapse = vi.spyOn(native, 'collapse');
  const extend = vi.spyOn(native, 'extend');

  const payload = resolveCompanionSelectionCommandPayload('source', adapter);

  expect(payload?.entries[0]?.locator).toEqual({ from: 7, to: 13, originalText: 'क्षत्र' });
  expect(payload?.clozeContent).toBe('क्षत्र [...]');
  expect(native.anchorOffset).toBe(12);
  expect(native.focusOffset).toBe(9);
  expect(collapse).not.toHaveBeenCalled();
  expect(extend).not.toHaveBeenCalled();
});

it('uses the saved Off setting for the next selection and discards a stale editor range', () => {
  const settings = render(<CompanionDevanagariSelectionControl />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'off' } });
  settings.unmount();
  const reopened = render(<CompanionDevanagariSelectionControl />);
  expect(screen.getByRole('combobox')).toHaveValue('off');
  reopened.unmount();

  const { adapter, view, text } = openDocument();
  const selection = window.getSelection()!;
  selection.setBaseAndExtent(text, 9, text, 13);
  view.dispatch({ selection: { anchor: 9, head: 13 }, userEvent: 'select.pointer' });
  expect(resolveCompanionSelectionCommandPayload('source', adapter)?.entries[0]?.locator)
    .toEqual({ from: 9, to: 13, originalText: body.slice(9, 13) });
  selection.collapse(text, 9);
  expect(adapter.getSelection()).toEqual({ from: 9, to: 13 });
  expect(resolveCompanionSelectionCommandPayload('source', adapter)).toBeNull();
});

it('maps a multiline selection and leaves English boundaries unchanged', () => {
  const { adapter, view, text } = openDocument(false, 'Start here\nFinish here');
  const end = view.contentDOM.querySelectorAll('.cm-line')[1]!.firstChild!;
  window.getSelection()!.setBaseAndExtent(end, 6, text, 6);
  expect(resolveCompanionSelectionCommandPayload('source', adapter)?.entries[0]?.locator)
    .toEqual({ from: 6, to: 17, originalText: 'here\nFinish' });
});

it.each(['annotation', 'off'] as const)('keeps the toolbar on the moving focus after the native anchor escapes (%s)', async (mode) => {
  fireEvent.change(render(<CompanionDevanagariSelectionControl />).getByRole('combobox'), { target: { value: mode } });
  const source = `पहला क्षत्र\n\n${body}`;
  const { adapter, view, text } = openDocument(false, source);
  const end = view.contentDOM.querySelectorAll('.cm-line')[2]!.firstChild!;
  const native = window.getSelection()!;
  const getRangeAt = native.getRangeAt.bind(native);
  vi.spyOn(native, 'getRangeAt').mockImplementation(index => Object.assign(getRangeAt(index), {
    getBoundingClientRect: () => new DOMRect(20, 100, 100, 20)
  }));
  const { result } = renderHook(() => useCompanionSelectionAnnotationToolbar({
    canCreateAnnotation: true, nodeId: 'source', snapshot: null
  }));
  result.current.handleEditorReady(adapter);
  view.dispatch({ selection: { anchor: 5, head: 11 }, userEvent: 'select.pointer' });
  native.setBaseAndExtent(text, 5, text, 11);
  fireEvent.pointerUp(view.contentDOM);
  const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
  await settle();
  expect(result.current.selectionToolbar?.payload?.selectionText).toBe('क्षत्र');

  // The report shows a connected element anchor outside the editor, a moving in-editor focus,
  // and an unchanged CodeMirror range.
  native.setBaseAndExtent(view.dom.parentElement!, 0, end, 6);
  expect(adapter.getSelection()).toEqual({ from: 5, to: 11 });
  fireEvent(document, new Event('selectionchange'));
  await settle();

  const locator = { from: 5, to: 19, originalText: source.slice(5, 19) };
  expect(result.current.selectionToolbar?.payload?.entries[0]?.locator).toEqual(locator);
  expect(result.current.resolveSelectionPayload()?.entries[0]?.locator).toEqual(locator);

  native.collapse(end, 6);
  fireEvent(document, new Event('selectionchange'));
  await settle();
  expect(result.current.selectionToolbar).toBeNull();
  native.setBaseAndExtent(view.dom.parentElement!, 0, end, 5);
  expect(result.current.resolveSelectionPayload()).toBeNull();
});

it('does not annotate an invisible range or accept an endpoint owned by another document', () => {
  const { adapter, text } = openDocument(false, 'क्षत्र\u200b');
  const native = window.getSelection()!;
  native.setBaseAndExtent(text, 6, text, 7);
  expect(resolveCompanionSelectionCommandPayload('source', adapter)).toBeNull();
  const other = openDocument().text;
  native.setBaseAndExtent(text, 2, other, 4);
  expect(resolveCompanionSelectionCommandPayload('source', adapter)).toBeNull();
});

it('keeps the validated note range when the input takes focus', () => {
  const { adapter, text } = openDocument();
  const native = window.getSelection()!;
  native.setBaseAndExtent(text, 12, text, 9);
  const resolveSelectionPayload = () => resolveCompanionSelectionCommandPayload('source', adapter);
  const onApply = vi.fn();
  render(<CompanionSelectionAnnotationToolbar editor={adapter} resolveSelectionPayload={resolveSelectionPayload}
    state={{ left: 0, noteLeft: 0, noteTop: 0, top: 0, payload: resolveSelectionPayload() }}
    onApply={onApply} onClose={() => {}} onAddExistingHighlightNote={() => {}} onDeleteExistingHighlight={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
  native.collapse(text, 9);
  fireEvent.change(screen.getByTestId('companion-selection-note-text'), { target: { value: 'A note' } });
  fireEvent.click(screen.getByTestId('companion-selection-note-save'));
  expect(onApply).toHaveBeenCalledWith('note', expect.objectContaining({ selectionText: 'क्षत्र' }), 'A note');
});

it.each([
  { source: 'क्‍ष्‍त्र', start: 3, end: 5, from: 0, to: 9 },
  { source: 'क्‌ष', start: 3, end: 4, from: 3, to: 4 },
  { source: 'क्षि', start: 2, end: 3, from: 0, to: 4 }
])('respects the Devanagari grapheme boundaries in $source', ({ source, start, end, from, to }) => {
  const { adapter, text } = openDocument(false, source);
  window.getSelection()!.setBaseAndExtent(text, start, text, end);
  expect(resolveCompanionSelectionCommandPayload('source', adapter)?.entries[0]?.locator)
    .toEqual({ from, to, originalText: source.slice(from, to) });
});
