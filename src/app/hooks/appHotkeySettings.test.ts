import { expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { buildHotkeySettings } from './appHotkeySettings';

it('adds global capture as a standard editable hotkey item', () => {
  const settings = buildHotkeySettings([], {
    overrides: {
      [APP_COMMAND_IDS.globalCaptureToInbox]: { primary: 'Cmd+Shift+X' }
    },
    resetAllShortcuts: vi.fn(),
    resetShortcut: vi.fn(),
    shortcutMap: {
      [APP_COMMAND_IDS.globalCaptureToInbox]: {
        primary: { key: 'x', metaKey: true, shiftKey: true }
      }
    },
    updateShortcut: vi.fn()
  });

  expect(settings.hotkeyItems[0]).toMatchObject({
    commandId: APP_COMMAND_IDS.globalCaptureToInbox,
    isCustomized: true,
    primaryShortcutLabel: 'Cmd+Shift+X',
    section: 'Capture',
    title: 'Capture to Inbox (global)'
  });
  expect(settings.onHotkeyUpdate).toBeTypeOf('function');
});
