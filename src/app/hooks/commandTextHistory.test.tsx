import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useAppCommandShortcutDispatcher } from './useAppCommandShortcutDispatcher';
import { useNativeCommandMenu } from './useNativeCommandMenu';

const { subscribe } = vi.hoisted(() => ({ subscribe: vi.fn() }));
vi.mock('../../shared/platform/commandMenu', () => ({
  onNativeMenuCommand: subscribe,
  syncNativeMenuState: vi.fn().mockResolvedValue(undefined)
}));

const items = [
  { enabled: true, id: 'app.undo', title: 'Undo' },
  { enabled: true, id: 'app.redo', title: 'Redo' }
];

beforeEach(() => subscribe.mockResolvedValue(() => undefined));
afterEach(() => { delete (document as Partial<Document>).execCommand; });

function Harness({ run, native = false }: { run: (id: string) => void; native?: boolean }) {
  useAppCommandShortcutDispatcher({
    isCommandSurfaceOpen: false, items, runCommand: run,
    shortcutMap: {
      'app.undo': { primary: { ctrlKey: true, key: 'u' } },
      'app.redo': { primary: { ctrlKey: true, key: 'r' } }
    }
  });
  useNativeCommandMenu(native ? items : [], run);
  return <div role="dialog"><textarea aria-label="Feedback" /></div>;
}

it.each(['u', 'r'])('leaves configured history key %s with a focused ordinary text field', (key) => {
  const run = vi.fn();
  render(<Harness run={run} />);
  const input = screen.getByRole('textbox');
  input.focus();
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, key });
  input.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(run).not.toHaveBeenCalled();
});

it('uses focused text ownership even when the keyboard event targets the window', () => {
  const run = vi.fn();
  render(<Harness run={run} />);
  screen.getByRole('textbox').focus();
  window.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, ctrlKey: true, key: 'u' }));
  expect(run).not.toHaveBeenCalled();
});

it.each(['app.undo', 'app.redo'])('keeps native %s in the text field even with no text history', async (id) => {
  let handler: ((id: string) => void) | undefined;
  subscribe.mockImplementation(async (callback: (id: string) => void) => {
    handler = callback;
    return () => undefined;
  });
  const edit = vi.fn().mockReturnValue(false);
  Object.defineProperty(document, 'execCommand', { configurable: true, value: edit });
  const run = vi.fn();
  render(<Harness native run={run} />);
  screen.getByRole('textbox').focus();
  await waitFor(() => expect(handler).toBeDefined());
  act(() => handler?.(id));
  expect(edit).toHaveBeenCalledWith(id === 'app.undo' ? 'undo' : 'redo');
  expect(run).not.toHaveBeenCalled();
});

it('keeps native history commands routed to a declared content editor', async () => {
  let handler: ((id: string) => void) | undefined;
  subscribe.mockImplementation(async (callback: (id: string) => void) => {
    handler = callback;
    return () => undefined;
  });
  const run = vi.fn();
  render(<Harness native run={run} />);
  const input = screen.getByRole('textbox');
  input.setAttribute('data-undo-history-owner', 'content');
  input.focus();
  await waitFor(() => expect(handler).toBeDefined());
  act(() => handler?.('app.undo'));
  act(() => handler?.('app.redo'));
  expect(run.mock.calls).toEqual([['app.undo'], ['app.redo']]);
});
