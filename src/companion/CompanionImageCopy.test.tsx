import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { renderWithLocalization } from '../shared/localization/testLocalization';
import { invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';

import { CompanionArticleDocument } from './CompanionArticleDocument';

const clipboard = vi.hoisted(() => ({ writeClipboardText: vi.fn() }));
vi.mock('../shared/platform/companion/runtime/textClipboard', () => clipboard);
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => async (command: string) =>
  command === 'resolve_attachment_resource' ? { status: 'ready', resource_url: 'https://example.com/image.png', mime_type: 'image/png' } : { intrinsic_size: null } }));

const image = `![Diagram|320](asset://${'a'.repeat(64)}.png)`;
const content = `Before\n\n${image}\n\nAfter`;
Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
beforeEach(() => clipboard.writeClipboardText.mockReset().mockResolvedValue(undefined));
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function renderDocument(editing = true, nodeId = 'source') {
  let editor: EditorAdapter | null = null;
  const onChange = vi.fn();
  const view = renderWithLocalization(<MouseGestureSettingsProvider><CompanionArticleDocument nodeId={nodeId} content={content}
    {...(editing ? { onChange } : {})} onEditorReady={value => { editor = value; }} /></MouseGestureSettingsProvider>);
  await waitFor(() => expect(view.container.querySelector('.cm-md-image-widget')).not.toBeNull());
  return { ...view, onChange, get editor() { return editor!; }, get widget() { return view.container.querySelector<HTMLElement>('.cm-md-image-widget')!; } };
}

it('copies rendered image source and pastes through the real CM6 text paste event into another topic', async () => {
  const source = await renderDocument();
  const target = await renderDocument(true, 'target');
  fireEvent.contextMenu(source.widget);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy image' }));
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  expect(clipboard.writeClipboardText).toHaveBeenCalledExactlyOnceWith(image);
  const text = clipboard.writeClipboardText.mock.calls[0]![0] as string;
  act(() => { target.editor.setSelection({ from: content.length, to: content.length }); });
  fireEvent.paste(target.container.querySelector('.cm-content')!, { clipboardData: {
    getData: (type: string) => type === 'text/plain' ? `\n\n${text}` : '', items: []
  } });
  expect(target.editor.getContent()).toBe(`${content}\n\n${image}`);
  expect(source.editor.getContent()).toBe(content);
  await waitFor(() => expect(target.container.querySelectorAll('.cm-md-image-widget')).toHaveLength(2));
});

it.each([false, true])('does not intercept reading or answer image context menus (answer: %s)', answer => {
  return renderDocument(answer, answer ? 'source::answer' : 'source').then(view => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    view.widget.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole('menuitem', { name: 'Copy image' })).not.toBeInTheDocument();
  });
});

it('keeps failed copying retryable and never changes the source', async () => {
  const view = await renderDocument();
  clipboard.writeClipboardText.mockRejectedValueOnce(new Error('Denied'));
  fireEvent.contextMenu(view.widget);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy image' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(view.editor.getContent()).toBe(content);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy image' }));
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  expect(clipboard.writeClipboardText).toHaveBeenCalledTimes(2);
});

it('opens on a held touch but cancels short taps, movement, cancellation and multi-touch', async () => {
  const view = await renderDocument();
  vi.useFakeTimers();
  for (const action of ['up', 'move', 'cancel', 'multi']) {
    fireEvent.pointerDown(view.widget, { pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: 20, clientY: 20 });
    if (action === 'up') fireEvent.pointerUp(view.widget);
    if (action === 'move') fireEvent.pointerMove(view.widget, { pointerId: 1, clientX: 20, clientY: 60 });
    if (action === 'cancel') fireEvent.pointerCancel(view.widget);
    if (action === 'multi') fireEvent.pointerDown(view.widget, { pointerType: 'touch', isPrimary: false, pointerId: 2 });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  }
  fireEvent.pointerDown(view.widget, { pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: 20, clientY: 20 });
  act(() => vi.advanceTimersByTime(500));
  expect(screen.getByRole('menuitem', { name: 'Copy image' })).toBeInTheDocument();
});

it('dismisses on scrolling or switching libraries and leaves ordinary text context menus native', async () => {
  const view = await renderDocument();
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  view.container.querySelector('.cm-content')!.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  fireEvent.contextMenu(view.widget);
  fireEvent.scroll(window);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  fireEvent.contextMenu(view.widget);
  act(() => invalidateCompanionReadingScope());
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

it('does not repeat a pending copy or close a newer menu after an old copy completes', async () => {
  const view = await renderDocument();
  let finish!: () => void;
  clipboard.writeClipboardText.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
  fireEvent.contextMenu(view.widget);
  const copy = screen.getByRole('menuitem', { name: 'Copy image' });
  fireEvent.click(copy);
  fireEvent.click(copy);
  expect(clipboard.writeClipboardText).toHaveBeenCalledTimes(1);
  fireEvent.scroll(window);
  fireEvent.contextMenu(view.widget);
  await act(async () => finish());
  expect(screen.getByRole('menuitem', { name: 'Copy image' })).toBeEnabled();
  expect(view.editor.getContent()).toBe(content);
});

it('does not copy stale image text after the underlying document changes', async () => {
  const view = await renderDocument();
  fireEvent.contextMenu(view.widget);
  act(() => view.editor.replaceRange(0, 0, 'Changed\n'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy image' }));
  expect(clipboard.writeClipboardText).not.toHaveBeenCalled();
  expect(view.editor.getContent()).toBe(`Changed\n${content}`);
});
