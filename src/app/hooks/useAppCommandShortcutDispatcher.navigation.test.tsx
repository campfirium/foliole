import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { useAppCommandShortcutDispatcher } from './useAppCommandShortcutDispatcher';

function Harness({ runCommand }: { runCommand: (id: string) => void }) {
  useAppCommandShortcutDispatcher({
    isCommandSurfaceOpen: false,
    items: [
      { enabled: true, id: APP_COMMAND_IDS.goBack, title: 'Go Back' },
      { enabled: true, id: APP_COMMAND_IDS.goToLastChild, title: 'Go Down' }
    ],
    runCommand,
    shortcutMap: {
      [APP_COMMAND_IDS.goBack]: { primary: { key: 'ArrowLeft', metaKey: true } },
      [APP_COMMAND_IDS.goToLastChild]: { primary: { key: 'ArrowDown', metaKey: true } }
    }
  });
  return <input aria-label="Title" />;
}

function dispatchFrom(input: HTMLInputElement, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  input.dispatchEvent(event);
  return event;
}

it('dispatches application navigation before a focused title input handles arrow keys', () => {
  const runCommand = vi.fn();
  render(<Harness runCommand={runCommand} />);
  const input = document.querySelector('input')!;
  input.focus();

  expect(dispatchFrom(input, { key: 'ArrowLeft', metaKey: true }).defaultPrevented).toBe(true);
  expect(dispatchFrom(input, { key: 'ArrowDown', metaKey: true }).defaultPrevented).toBe(true);
  expect(runCommand).toHaveBeenNthCalledWith(1, APP_COMMAND_IDS.goBack);
  expect(runCommand).toHaveBeenNthCalledWith(2, APP_COMMAND_IDS.goToLastChild);
});
