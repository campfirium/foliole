import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { AppSelectionDropdownMenu, AppSelectionDropdownMenuItem } from './DropdownMenu';

it('prevents selection-safe menu items from stealing focus on pointer down', () => {
  render(
    <AppSelectionDropdownMenu left={40} onClose={() => undefined} top={56}>
      <AppSelectionDropdownMenuItem>Highlight</AppSelectionDropdownMenuItem>
    </AppSelectionDropdownMenu>
  );

  const item = screen.getByRole('menuitem', { name: 'Highlight' });
  const pointerDown = createEvent.pointerDown(item);
  fireEvent(item, pointerDown);
  expect(pointerDown.defaultPrevented).toBe(true);

  const mouseDown = createEvent.mouseDown(item);
  fireEvent(item, mouseDown);
  expect(mouseDown.defaultPrevented).toBe(true);
});

it('closes selection-safe menu on escape', () => {
  const onClose = vi.fn();

  render(
    <AppSelectionDropdownMenu left={40} onClose={onClose} top={56}>
      <AppSelectionDropdownMenuItem>Highlight</AppSelectionDropdownMenuItem>
    </AppSelectionDropdownMenu>
  );

  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});
