import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const menuModelMocks = vi.hoisted(() => ({
  buildCommandMenuSections: vi.fn((): Array<{
    id: string;
    title: string;
    items: Array<{ enabled: boolean; id: string; title: string }>;
  }> => [])
}));

vi.mock('../../shared/commands/menuModel', () => ({
  buildCommandMenuSections: menuModelMocks.buildCommandMenuSections
}));

import { CommandPalette } from './CommandPalette';

it('skips menu section building while the command palette is closed', () => {
  render(
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

  expect(menuModelMocks.buildCommandMenuSections).toHaveBeenCalledWith([], [], '');
  expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
});

it('keeps tab focus inside the command palette dialog', async () => {
  menuModelMocks.buildCommandMenuSections.mockReturnValue([
    {
      id: 'commands',
      title: 'Commands',
      items: [{ enabled: true, id: 'open-topic', title: 'Open topic' }]
    }
  ]);

  render(
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

  expect(dialog).toHaveAttribute('aria-modal', 'true');
  await waitFor(() => expect(input).toHaveFocus());

  result.focus();
  fireEvent.keyDown(result, { key: 'Tab' });
  expect(input).toHaveFocus();

  fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
  expect(result).toHaveFocus();
});
