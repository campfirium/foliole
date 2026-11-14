import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { usesMacShortcutProjection } from '../../shared/platform/runtime/operatingSystem';

import { useAppCommandShortcutDispatcher } from './useAppCommandShortcutDispatcher';

function Harness({ runCommand }: { runCommand: (id: string) => void }) {
  useAppCommandShortcutDispatcher({
    isCommandSurfaceOpen: false,
    items: [
      { enabled: true, id: 'app.undo', title: 'Undo' },
      { enabled: true, id: 'app.redo', title: 'Redo' }
    ],
    runCommand,
    shortcutMap: {
      'app.undo': { primary: { ctrlKey: true, key: 'u' }, secondary: { key: 'F8' } },
      'app.redo': { primary: { ctrlKey: true, key: 'r' }, secondary: { key: 'F9' } }
    }
  });
  return null;
}

it('consumes held undo and redo bindings before the browser can run their default actions', () => {
  const runCommand = vi.fn();
  render(<Harness runCommand={runCommand} />);
  const dispatch = (init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  expect(dispatch({ ctrlKey: true, key: 'u' })).toBe(true);
  expect(dispatch({ ctrlKey: true, key: 'u', repeat: true })).toBe(true);
  expect(dispatch({ key: 'F8', repeat: true })).toBe(true);
  const standardModifier = usesMacShortcutProjection() ? { metaKey: true } : { ctrlKey: true };
  expect(dispatch({ ...standardModifier, key: 'x', repeat: true })).toBe(true);
  expect(dispatch({ ...standardModifier, key: 'v', repeat: true })).toBe(false);
  expect(dispatch({ key: 'u', repeat: true })).toBe(false);
  expect(dispatch({ ctrlKey: true, key: 'u' })).toBe(true);
  expect(dispatch({ ctrlKey: true, key: 'r' })).toBe(true);
  expect(dispatch({ ctrlKey: true, key: 'r', repeat: true })).toBe(true);
  expect(dispatch({ key: 'F9', repeat: true })).toBe(true);
  expect(dispatch({ ...standardModifier, shiftKey: true, key: 'Z', repeat: true })).toBe(true);
  expect(dispatch({ ctrlKey: true, key: 'r' })).toBe(true);
  expect(runCommand.mock.calls).toEqual([['app.undo'], ['app.undo'], ['app.redo'], ['app.redo']]);
});
