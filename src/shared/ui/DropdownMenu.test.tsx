import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../localization/testLocalization';

import {
  AppDropdownMenu,
  AppDropdownMenuCheckItem,
  AppDropdownMenuContent,
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppSelectionDropdownMenu,
  AppSelectionDropdownMenuItem
} from './DropdownMenu';

it('prevents selection-safe menu items from stealing focus on pointer down', () => {
  renderWithLocalization(
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

  renderWithLocalization(
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

  renderWithLocalization(
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
  renderWithLocalization(
    <AppSelectionDropdownMenu left={40} onClose={() => undefined} top={56}>
      <AppSelectionDropdownMenuItem>Highlight</AppSelectionDropdownMenuItem>
    </AppSelectionDropdownMenu>
  );

  const item = screen.getByRole('menuitem', { name: 'Highlight' });
  expect(item.className).toContain('focus:bg-[var(--app-selection-surface-color)]');
  expect(item.className).toContain('hover:bg-[var(--app-selection-surface-color)]');
});

it('renders menus above tooltip-level floating surfaces', () => {
  renderWithLocalization(
    <AppSelectionDropdownMenu left={40} onClose={() => undefined} top={56}>
      <AppSelectionDropdownMenuItem>Highlight</AppSelectionDropdownMenuItem>
    </AppSelectionDropdownMenu>
  );

  const menu = screen.getByRole('menu', { name: 'Selection commands' });
  expect(menu.className).toContain('z-dropdown');
  expect(menu.className).toContain('shadow-popover');
  expect(menu.className).toContain('bg-[color-mix(in_oklab,var(--app-floating-surface-bg)_82%,rgb(var(--color-background)))]');
});

it('uses shared dropdown styling for grouped checked menu items', () => {
  render(
    <AppDropdownMenu open>
      <AppDropdownMenuTrigger>Sort</AppDropdownMenuTrigger>
      <AppDropdownMenuContent>
        <AppDropdownMenuLabel>Sort by</AppDropdownMenuLabel>
        <AppDropdownMenuCheckItem checked>Date modified</AppDropdownMenuCheckItem>
        <AppDropdownMenuSeparator />
        <AppDropdownMenuCheckItem checked={false}>Name</AppDropdownMenuCheckItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );

  const checkedItem = screen.getByRole('menuitem', { name: 'Date modified' });
  expect(checkedItem).toHaveAttribute('aria-checked', 'true');
  expect(checkedItem.className).toContain('data-[highlighted]:bg-[var(--app-floating-item-hover-bg)]');
  expect(screen.getByText('Sort by').className).toContain('text-foreground/45');
  expect(screen.getByRole('separator').className).toContain('var(--app-floating-divider-color)');
});
