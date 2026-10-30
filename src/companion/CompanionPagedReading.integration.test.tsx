import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { chooseMode, mountPagedArticle, openReadingMode, pointer, tap } from './companionPagedReading.test-support';
import { loadCompanionReadingMode } from './companionReadingMode';

vi.mock('@/features/editor/components/MarkdownEditor', () => ({ MarkdownEditor: () => <div>
  <p>Reading body</p><a href="#topic">Link</a><mark className="cm-md-highlight">Highlight</mark>
</div> }));

beforeEach(() => window.localStorage.clear());
afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('defaults to continuous scrolling and switches exclusively to durable paged scrolling through Appearance', () => {
  const view = mountPagedArticle();
  expect(loadCompanionReadingMode()).toBe('continuous');
  expect(view.surface.style.overflowY).not.toBe('hidden');
  tap(view.body, 355);
  expect(screen.getByRole('button', { name: 'More reading actions' })).toBeInTheDocument();
  tap(view.body, 185);
  view.surface.scrollTop = 180;
  chooseMode('Paged scroll');
  expect(view.surface.style.overflowY).toBe('hidden');
  expect(view.surface.scrollTop).toBe(180);
  expect(loadCompanionReadingMode()).toBe('paged');
  view.unmount();
  const remounted = mountPagedArticle();
  expect(remounted.surface.style.overflowY).toBe('hidden');
  openReadingMode();
  expect(screen.getByRole('button', { name: 'Paged scroll' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Continuous scroll' }));
  expect(remounted.surface.style.overflowY).not.toBe('hidden');
  expect(loadCompanionReadingMode()).toBe('continuous');
});

it('turns once per side touch or mouse click and lets center taps toggle both toolbars without moving', () => {
  const { surface, body, exit } = mountPagedArticle();
  chooseMode('Paged scroll');
  tap(body, 185);
  expect(screen.queryByRole('button', { name: 'More reading actions' })).not.toBeInTheDocument();
  tap(body, 355);
  const page = surface.scrollTop;
  expect(page).toBeGreaterThan(500);
  expect(page).toBeLessThan(676);
  expect(screen.queryByRole('button', { name: 'More reading actions' })).not.toBeInTheDocument();
  tap(body, 185);
  expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'More reading actions' })).toBeInTheDocument();
  expect(surface.scrollTop).toBe(page);
  fireEvent.pointerDown(body, { pointerType: 'mouse' });
  fireEvent.click(body, { detail: 1, clientX: 355 });
  expect(surface.scrollTop).toBe(page * 2);
  tap(body, 20);
  expect(surface.scrollTop).toBe(page);
  tap(body, 20);
  tap(body, 20);
  expect(surface.scrollTop).toBe(0);
  for (let i = 0; i < 12; i++) tap(body, 355);
  expect(surface.scrollTop).toBe(4000 - 812);
  expect(exit).not.toHaveBeenCalled();
});

it('uses the current viewport after resize and never skips short documents', () => {
  const { surface, body } = mountPagedArticle();
  chooseMode('Paged scroll');
  Object.defineProperty(surface, 'clientHeight', { value: 600 });
  tap(body, 355);
  expect(surface.scrollTop).toBeGreaterThan(0);
  expect(surface.scrollTop).toBeLessThan(464);
  Object.defineProperty(surface, 'scrollHeight', { value: 580 });
  tap(body, 355);
  expect(surface.scrollTop).toBe(0);
});

it('pages vertically once per swipe and wheel burst, ignoring diagonal, cancelled and multi-touch gestures', () => {
  const { surface, body } = mountPagedArticle();
  chooseMode('Paged scroll');
  pointer(body, 'pointerdown', 185, 500);
  pointer(body, 'pointermove', 185, 350);
  pointer(body, 'pointerup', 185, 300);
  fireEvent.click(body, { detail: 1, clientX: 185 });
  const page = surface.scrollTop;
  expect(page).toBeGreaterThan(0);
  pointer(body, 'pointerdown', 185, 300);
  pointer(body, 'pointermove', 185, 450);
  pointer(body, 'pointerup', 185, 500);
  expect(surface.scrollTop).toBe(0);
  pointer(body, 'pointerdown', 185, 500);
  pointer(body, 'pointerup', 300, 420);
  pointer(body, 'pointerdown', 185, 500);
  pointer(body, 'pointercancel', 185, 350);
  pointer(body, 'pointerup', 185, 300);
  pointer(body, 'pointerdown', 185, 500);
  pointer(body, 'pointerdown', 200, 480, 2);
  pointer(body, 'pointerup', 185, 300);
  expect(surface.scrollTop).toBe(0);
  vi.useFakeTimers();
  fireEvent.wheel(body, { deltaY: 120 });
  fireEvent.wheel(body, { deltaY: 80 });
  expect(surface.scrollTop).toBe(page);
  act(() => { vi.advanceTimersByTime(200); });
  fireEvent.wheel(body, { deltaY: -120 });
  expect(surface.scrollTop).toBe(0);
});

it('leaves links, highlights, selections and long presses alone', () => {
  const { surface, body } = mountPagedArticle();
  chooseMode('Paged scroll');
  for (const label of ['Link', 'Highlight']) tap(screen.getByText(label), 355);
  expect(surface.scrollTop).toBe(0);
  const selection = window.getSelection()!;
  const range = document.createRange();
  range.setStart(body.firstChild!, 0);
  range.setEnd(body.firstChild!, body.textContent!.length);
  Object.defineProperty(range, 'getClientRects', { value: () => [] });
  selection.removeAllRanges();
  selection.addRange(range);
  expect(body.isConnected).toBe(true);
  expect(selection.isCollapsed).toBe(false);
  tap(body, 355);
  expect(surface.scrollTop).toBe(0);
  expect(selection.isCollapsed).toBe(true);
  selection.removeAllRanges();
  selection.addRange(range);
  pointer(body, 'pointerdown', 185, 500);
  pointer(body, 'pointermove', 185, 400);
  pointer(body, 'pointerup', 185, 300);
  expect(surface.scrollTop).toBe(0);
  selection.removeAllRanges();
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  pointer(body, 'pointerdown', 355);
  now.mockReturnValue(1600);
  pointer(body, 'pointerup', 355);
  fireEvent.click(body, { detail: 1, clientX: 355 });
  expect(surface.scrollTop).toBe(0);
});

it('keeps normal editor scrolling while editing and restores pagination after finishing', async () => {
  const { surface, body } = mountPagedArticle();
  chooseMode('Paged scroll');
  fireEvent.click(screen.getByRole('button', { name: 'Edit content' }));
  expect(surface.style.overflowY).not.toBe('hidden');
  tap(body, 355);
  fireEvent.wheel(body, { deltaY: 120 });
  expect(surface.scrollTop).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await act(async () => undefined);
  expect(surface.style.overflowY).toBe('hidden');
});

it('retains the last confirmed mode on a real storage quota failure and allows retry', () => {
  const { surface } = mountPagedArticle();
  openReadingMode();
  const storage = window.localStorage;
  let used = 0;
  for (let i = 0; i < storage.length; i++) { const key = storage.key(i)!; used += key.length + storage.getItem(key)!.length; }
  storage.setItem('quota', 'x'.repeat(5_000_000 - used - 'quota'.length));
  fireEvent.click(screen.getByRole('button', { name: 'Paged scroll' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save reading settings');
  expect(loadCompanionReadingMode()).toBe('continuous');
  expect(surface.style.overflowY).not.toBe('hidden');
  storage.removeItem('quota');
  fireEvent.click(screen.getByRole('button', { name: 'Paged scroll' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(surface.style.overflowY).toBe('hidden');
});
