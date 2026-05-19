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

it('lets passthrough selection menus close without stealing the outside pointer target', () => {
  const onClose = vi.fn();
  const onPointerDown = vi.fn();

  render(
    <>
      <button onPointerDown={onPointerDown} type="button">Editor target</button>
      <AppSelectionDropdownMenu left={40} onClose={onClose} outsidePointerMode="passthrough" top={56}>
        <AppSelectionDropdownMenuItem>Lookup</AppSelectionDropdownMenuItem>
      </AppSelectionDropdownMenu>
    </>
  );

  expect(document.querySelector('.fixed.inset-0.z-workspace-overlay')).toBeNull();

  fireEvent.pointerDown(screen.getByRole('button', { name: 'Editor target' }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onPointerDown).toHaveBeenCalledTimes(1);
});

it('uses the shared selection surface color token for hover and focus states', () => {
  render(
    <AppSelectionDropdownMenu left={40} onClose={() => undefined} top={56}>
      <AppSelectionDropdownMenuItem>Highlight</AppSelectionDropdownMenuItem>
    </AppSelectionDropdownMenu>
  );

  const item = screen.getByRole('menuitem', { name: 'Highlight' });
  expect(item.className).toContain('focus:bg-[var(--app-selection-surface-color)]');
  expect(item.className).toContain('hover:bg-[var(--app-selection-surface-color)]');
});

it('renders menus above tooltip-level floating surfaces', () => {
  render(
    <AppSelectionDropdownMenu left={40} onClose={() => undefined} top={56}>
      <AppSelectionDropdownMenuItem>Highlight</AppSelectionDropdownMenuItem>
    </AppSelectionDropdownMenu>
  );

  const menu = screen.getByRole('menu', { name: 'Selection commands' });
  expect(menu.className).toContain('z-dropdown');
});
