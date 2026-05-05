import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const menuModelMocks = vi.hoisted(() => ({
  buildCommandMenuSections: vi.fn(() => [])
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
