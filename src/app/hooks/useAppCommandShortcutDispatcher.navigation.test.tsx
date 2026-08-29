import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { getPlatformDefaultCommandShortcuts } from '../../shared/commands/defaultShortcuts';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { useAppCommandShortcutDispatcher } from './useAppCommandShortcutDispatcher';

const NAVIGATION_ITEMS = [
  { enabled: true, id: APP_COMMAND_IDS.goBack, title: 'Go Back' },
  { enabled: true, id: APP_COMMAND_IDS.goForward, title: 'Go Forward' },
  { enabled: true, id: APP_COMMAND_IDS.goParent, title: 'Go Up' },
  { enabled: true, id: APP_COMMAND_IDS.goToLastChild, title: 'Go Down' }
];

function Harness({ platform, runCommand }: { platform: string; runCommand: (id: string) => void }) {
  useAppCommandShortcutDispatcher({
    isCommandSurfaceOpen: false,
    items: NAVIGATION_ITEMS,
    runCommand,
    shortcutMap: getPlatformDefaultCommandShortcuts(platform)
  });
  return <input aria-label="Title" />;
}

function dispatchFrom(input: HTMLInputElement, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  input.dispatchEvent(event);
  return event;
}

it.each([
  {
    events: [
      { key: 'ArrowLeft', metaKey: true },
      { key: 'ArrowRight', metaKey: true },
      { key: 'ArrowUp', metaKey: true },
      { key: 'ArrowDown', metaKey: true }
    ],
    platform: 'MacIntel'
  },
  {
    events: [
      { altKey: true, key: 'ArrowLeft' },
      { altKey: true, key: 'ArrowRight' },
      { ctrlKey: true, key: 'ArrowUp' },
      { ctrlKey: true, key: 'ArrowDown' }
    ],
    platform: 'Win32'
  }
])('intercepts $platform browser defaults and dispatches each navigation command once', ({ events, platform }) => {
  const runCommand = vi.fn();
  render(<Harness platform={platform} runCommand={runCommand} />);
  const input = document.querySelector('input')!;
  input.focus();

  for (const event of events) {
    expect(dispatchFrom(input, event).defaultPrevented).toBe(true);
  }
  expect(runCommand.mock.calls).toEqual([
    [APP_COMMAND_IDS.goBack],
    [APP_COMMAND_IDS.goForward],
    [APP_COMMAND_IDS.goParent],
    [APP_COMMAND_IDS.goToLastChild]
  ]);
});
