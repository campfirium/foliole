import { expect, it, vi } from 'vitest';

import { getPlatformDefaultCommandShortcuts } from '../../shared/commands/defaultShortcuts';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { preloadTranslationCatalog, translate } from '../../shared/localization/translations';

import { buildHotkeySettings } from './appHotkeySettings';

const english: NonNullable<Parameters<typeof buildHotkeySettings>[2]> = {
  locale: 'en',
  t: (key, params) => translate('en', key, params)
};

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
  }, english);

  expect(settings.hotkeyItems[0]).toMatchObject({
    commandId: APP_COMMAND_IDS.globalCaptureToInbox,
    isCustomized: true,
    primaryShortcutLabel: 'Cmd+Shift+X',
    section: 'Capture',
    title: 'Capture to Inbox (global)'
  });
  expect(settings.onHotkeyUpdate).toBeTypeOf('function');
});

it('shows the global capture title and category in Simplified Chinese', async () => {
  await preloadTranslationCatalog('zh-Hans');
  const settings = buildHotkeySettings([], {
    overrides: {},
    resetAllShortcuts: vi.fn(),
    resetShortcut: vi.fn(),
    shortcutMap: {},
    updateShortcut: vi.fn()
  }, { locale: 'zh-Hans', t: (key, params) => translate('zh-Hans', key, params) });

  expect(settings.hotkeyItems.find((item) => item.commandId === APP_COMMAND_IDS.globalCaptureToInbox))
    .toMatchObject({ section: '全局剪辑', title: '剪辑到收件箱（全局）' });
});

it('exposes both Windows redo entries as editable shortcut slots', () => {
  vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Win32');
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Windows');
  const redoShortcuts = {
    primary: { ctrlKey: true, key: 'z', shiftKey: true },
    secondary: { ctrlKey: true, key: 'y' }
  };
  const settings = buildHotkeySettings([
    { enabled: true, id: APP_COMMAND_IDS.redo, shortcuts: redoShortcuts, title: 'Redo' }
  ], {
    overrides: {},
    resetAllShortcuts: vi.fn(),
    resetShortcut: vi.fn(),
    shortcutMap: {},
    updateShortcut: vi.fn()
  }, english);

  expect(settings.hotkeyItems.find((item) => item.commandId === APP_COMMAND_IDS.redo)).toMatchObject({
    primaryShortcutLabel: 'Ctrl+Shift+Z',
    secondaryShortcutLabel: 'Ctrl+Y',
    shortcutDisplayEntries: [
      { label: 'Ctrl+Shift+Z', slot: 'primary' },
      { label: 'Ctrl+Y', slot: 'secondary' }
    ]
  });
  vi.restoreAllMocks();
});

it('shows the macOS annotation default in shortcut settings', () => {
  vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel');
  const annotationShortcuts = getPlatformDefaultCommandShortcuts('MacIntel')[APP_COMMAND_IDS.addSelectionNote]!;
  const settings = buildHotkeySettings([
    { enabled: true, id: APP_COMMAND_IDS.addSelectionNote, shortcuts: annotationShortcuts, title: 'Annotate Selection' }
  ], {
    overrides: {},
    resetAllShortcuts: vi.fn(),
    resetShortcut: vi.fn(),
    shortcutMap: { [APP_COMMAND_IDS.addSelectionNote]: annotationShortcuts },
    updateShortcut: vi.fn()
  }, english);

  expect(settings.hotkeyItems.find((item) => item.commandId === APP_COMMAND_IDS.addSelectionNote)).toMatchObject({
    primaryShortcutLabel: 'Cmd+Shift+A',
    shortcutDisplayEntries: [{ label: '⇧ ⌘ A', slot: 'primary' }],
    title: 'Annotate Selection'
  });
  vi.restoreAllMocks();
});
