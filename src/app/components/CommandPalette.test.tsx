import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const menuModelMocks = vi.hoisted(() => ({
  buildCommandMenuSections: vi.fn((): Array<{
    id: string;
    title: string;
    items: Array<{ enabled: boolean; id: string; title: string; shortcuts?: { primary?: { ctrlKey?: boolean; key: string }; secondary?: { key: string; metaKey?: boolean } } }>;
  }> => [])
}));
const hotkeyMocks = vi.hoisted(() => ({ onConfigureShortcut: vi.fn() }));

vi.mock('../../shared/commands/menuModel', () => ({
  buildCommandMenuSections: menuModelMocks.buildCommandMenuSections
}));
vi.mock('../../features/settings/context/HotkeySettingsProvider', () => ({
  useHotkeySettings: () => hotkeyMocks
}));

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { CommandPalette } from './CommandPalette';

afterEach(() => {
  hotkeyMocks.onConfigureShortcut.mockClear();
  vi.restoreAllMocks();
});

it('skips menu section building while the command palette is closed', () => {
  renderWithLocalization(
    <CommandPalette
      isOpen={false}
      items={[
        {
          enabled: true,
          id: 'open-note',
          title: 'Open note'
        }
      ]}
      recentCommandIds={['open-note']}
      onClose={() => undefined}
      onRunCommand={() => undefined}
    />
  );

  expect(menuModelMocks.buildCommandMenuSections).toHaveBeenCalledWith([], [], '', { recentTitle: 'Recent' });
  expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
});

it('keeps tab focus inside the command palette dialog', async () => {
  menuModelMocks.buildCommandMenuSections.mockReturnValue([
    {
      id: 'navigation',
      title: 'Navigation',
      items: [
        {
          enabled: true,
          id: 'open-topic',
          shortcuts: { primary: { ctrlKey: true, key: 'p' }, secondary: { key: 'p', metaKey: true } },
          title: 'Open topic'
        }
      ]
    }
  ]);

  renderWithLocalization(
    <CommandPalette
      isOpen
      items={[{ enabled: true, id: 'open-topic', title: 'Open topic' }]}
      recentCommandIds={[]}
      onClose={() => undefined}
      onRunCommand={() => undefined}
    />
  );

  const dialog = screen.getByRole('dialog', { name: 'Command palette' });
  const input = screen.getByRole('textbox', { name: 'Search commands' });
  const result = screen.getByRole('button', { name: 'Open topic' });
  const configure = screen.getByRole('button', { name: 'Configure shortcut for Open topic' });

  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(input).toHaveAttribute('autocomplete', 'off');
  expect(input).toHaveAttribute('data-1p-ignore', 'true');
  expect(input).toHaveAttribute('data-bwignore', 'true');
  expect(input).toHaveAttribute('data-lpignore', 'true');
  expect(input).toHaveAttribute('spellcheck', 'false');
  expect(result).toHaveAttribute('aria-keyshortcuts', 'Control+P Meta+P');
  expect(screen.getByText('Navigation')).toBeInTheDocument();
  await waitFor(() => expect(input).toHaveFocus());

  configure.focus();
  fireEvent.keyDown(configure, { key: 'Tab' });
  expect(input).toHaveFocus();

  fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
  expect(configure).toHaveFocus();
});

it('shows native macOS symbols and routes shortcut configuration through Settings', () => {
  vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel');
  const onRunCommand = vi.fn();
  menuModelMocks.buildCommandMenuSections.mockReturnValue([{
    id: 'create',
    title: 'Create',
    items: [{
      enabled: true,
      id: 'create-folder',
      shortcuts: { primary: { ctrlKey: true, key: 'n' }, secondary: { key: 'n', metaKey: true } },
      title: 'Create Folder'
    }]
  }]);

  renderWithLocalization(
    <CommandPalette isOpen items={[]} recentCommandIds={[]} onClose={() => undefined} onRunCommand={onRunCommand} />
  );

  expect(screen.getByRole('button', { name: 'Configure shortcut for Create Folder' })).toHaveTextContent('⌘ N');
  fireEvent.click(screen.getByRole('button', { name: 'Configure shortcut for Create Folder' }));
  expect(hotkeyMocks.onConfigureShortcut).toHaveBeenCalledWith('create-folder');
  expect(onRunCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.openSettings);
  expect(onRunCommand).not.toHaveBeenCalledWith('create-folder');
});

it('keeps shortcut configuration available for a disabled command', () => {
  const onRunCommand = vi.fn();
  menuModelMocks.buildCommandMenuSections.mockReturnValue([{
    id: 'create',
    title: 'Create',
    items: [{ enabled: false, id: 'create-topic', title: 'Create Topic' }]
  }]);

  renderWithLocalization(
    <CommandPalette isOpen items={[]} recentCommandIds={[]} onClose={() => undefined} onRunCommand={onRunCommand} />
  );

  fireEvent.change(screen.getByRole('textbox', { name: 'Search commands' }), { target: { value: 'topic' } });
  expect(screen.getByRole('button', { name: 'Create Topic' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Configure shortcut for Create Topic' }));
  expect(hotkeyMocks.onConfigureShortcut).toHaveBeenCalledWith('create-topic');
  expect(onRunCommand).toHaveBeenCalledWith(APP_COMMAND_IDS.openSettings);
});

it('closes from the shared Escape stack before editor Escape handlers', () => {
  const onClose = vi.fn();
  renderWithLocalization(
    <CommandPalette
      isOpen
      items={[]}
      recentCommandIds={[]}
      onClose={onClose}
      onRunCommand={() => undefined}
    />
  );

  fireEvent.keyDown(window, { key: 'Escape' });

  expect(onClose).toHaveBeenCalledTimes(1);
});
