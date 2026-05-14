import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { expect, it, vi } from 'vitest';

import { WorkspaceSurfaceAutomaticSeedPopover } from './WorkspaceSurfaceAutomaticSeedPopover';
import { WorkspaceSurfaceColorEditor } from './WorkspaceSurfaceColorEditor';
import { WorkspaceSurfaceThemeFavoritesPopover } from './WorkspaceSurfaceThemeFavoritesPopover';

const color = { a: 1, b: 210, g: 180, r: 120 };
const autoOptions = { documentPureWhite: false, folderTopicSharedTone: false };

it('exposes the theme favorites popover as a named non-modal dialog', async () => {
  const triggerRef = createRef<HTMLButtonElement>();
  render(
    <>
      <button ref={triggerRef} type="button">
        Favorites
      </button>
      <WorkspaceSurfaceThemeFavoritesPopover
        currentPalette={['#ffffff']}
        favorites={[['#ffffff', '#f5f5f3']]}
        onApplyFavorite={vi.fn()}
        onClose={vi.fn()}
        onRemoveFavorite={vi.fn()}
        position={{ left: 12, top: 24, width: 280 }}
        triggerRef={triggerRef}
      />
    </>
  );

  const dialog = screen.getByRole('dialog', { name: 'Theme collection panel' });

  expect(dialog).not.toHaveAttribute('aria-modal');
  await waitFor(() => expect(dialog).toHaveFocus());
});

it('exposes the automatic seed picker as a named non-modal dialog', async () => {
  render(
    <WorkspaceSurfaceAutomaticSeedPopover
      color={color}
      onChange={vi.fn()}
      options={autoOptions}
      resolvedBaseColorMode="light"
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Automatic workspace seed color' }));
  const dialog = screen.getByRole('dialog', { name: 'Automatic workspace seed picker' });

  expect(dialog).not.toHaveAttribute('aria-modal');
  await waitFor(() => expect(dialog).toHaveFocus());
});

it('exposes the color editor as a named non-modal dialog', async () => {
  render(
    <WorkspaceSurfaceColorEditor
      anchorPoint={{ x: 24, y: 24 }}
      bounds={{ height: 640, width: 800 }}
      onClose={vi.fn()}
      onCommit={vi.fn()}
      value="#78b4d2"
    />
  );

  const dialog = screen.getByRole('dialog', { name: 'Workspace surface color editor' });

  expect(dialog).not.toHaveAttribute('aria-modal');
  await waitFor(() => expect(dialog).toHaveFocus());
});
