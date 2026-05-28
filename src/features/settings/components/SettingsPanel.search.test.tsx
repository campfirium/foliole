import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../../lib/platform/nativeContract';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';
import { SETTINGS_SEARCH_ROWS } from './settingsSearchRows';

beforeEach(() => {
  window.localStorage.clear();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const invoke = vi.fn(async (command: string) => {
    if (command === 'load_search_index_rebuild_status') return null;
    if (command === 'load_library_path_settings') {
      return {
        assets_dir: '/library/assets',
        data_dir: '/library/data',
        database_path: '/library/data/foliole.db',
        inbox: '/library/inbox',
        library_home: '/library',
        mirror: '/library/mirror',
        updated_at: '2026-05-27T00:00:00.000Z'
      };
    }
    if (command === 'load_external_search_folders') return [];
    return null;
  }) as unknown as NativeInvoke;
  window.electronAPI = {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onSearchIndexRebuildStatus: () => () => undefined,
    onWindowResized: () => () => undefined
  };
});

it('searches settings rows and jumps to the matching category row', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="about" />);

  fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), {
    target: { value: 'Desired retention' }
  });
  fireEvent.click(screen.getByRole('option', { name: /Desired retention/ }));

  let row: Element | null = null;
  await waitFor(() => {
    row = document.querySelector('[data-settings-search-row-id="review-desired-retention"]');
    expect(row).not.toBeNull();
  });
  await waitFor(() => {
    expect(row).toHaveClass('bg-[rgb(var(--app-accent-color-rgb)_/_0.12)]');
  });
  expect(screen.getByRole('button', { name: 'Review' })).toHaveAttribute('aria-current', 'page');
});

it('finds advanced review scheduler rows from settings search', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="about" />);

  fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), {
    target: { value: 'Priority weight' }
  });
  fireEvent.click(screen.getByRole('option', { name: /Priority weight/ }));

  await waitFor(() => {
    expect(document.querySelector('[data-settings-search-row-id="review-priority-weight"]')).not.toBeNull();
  });
  expect(screen.getByRole('button', { name: 'Review' })).toHaveAttribute('aria-current', 'page');
});

it('searches categories without mixing in action help actions', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="editor" />);
  const input = screen.getByRole('textbox', { name: 'Search settings' });

  fireEvent.change(input, { target: { value: 'Appearance' } });
  fireEvent.click(screen.getByRole('option', { name: /Appearance/ }));
  expect(screen.getByRole('button', { name: 'Appearance' })).toHaveAttribute('aria-current', 'page');

  fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), { target: { value: 'Relearn' } });
  expect(screen.getByText('No settings found.')).toBeInTheDocument();
});

it('supports keyboard selection and clears query with Escape before closing settings', () => {
  const onClose = vi.fn();
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} onClose={onClose} requestedCategory="about" />);
  const input = screen.getByRole('textbox', { name: 'Search settings' });

  fireEvent.change(input, { target: { value: 'Frontmatter' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Editor' })).toHaveAttribute('aria-current', 'page');

  fireEvent.change(input, { target: { value: 'Mirror' } });
  fireEvent.keyDown(input, { key: 'Escape', bubbles: true });
  expect(input).toHaveValue('');
  expect(onClose).not.toHaveBeenCalled();
});

it('closes search results when clicking outside or pressing Escape', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="about" />);
  const input = screen.getByRole('textbox', { name: 'Search settings' });

  fireEvent.change(input, { target: { value: 'Mirror' } });
  expect(screen.getByRole('listbox', { name: 'Settings search results' })).toBeInTheDocument();

  fireEvent.mouseDown(screen.getByRole('heading', { name: 'General' }));
  expect(screen.queryByRole('listbox', { name: 'Settings search results' })).not.toBeInTheDocument();

  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Mirror' } });
  fireEvent.keyDown(window, { key: 'Escape', bubbles: true });
  expect(screen.queryByRole('listbox', { name: 'Settings search results' })).not.toBeInTheDocument();
  expect(input).toHaveValue('');
});

it('aligns the settings search field to the header divider edge', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="about" />);
  const input = screen.getByRole('textbox', { name: 'Search settings' });
  const searchRoot = input.parentElement?.parentElement;

  expect(searchRoot).toHaveClass('right-0');
  expect(searchRoot).not.toHaveClass('right-5');
});

it('keeps registered row anchors renderable in their categories', async () => {
  const categories = [...new Set(SETTINGS_SEARCH_ROWS.map((row) => row.categoryId))];

  for (const category of categories) {
    const { unmount } = renderWithMouseGestureProvider(
      <SettingsPanel {...createProps()} requestedCategory={category} />
    );
    await waitFor(() => {
      const missing: string[] = [];
      for (const row of SETTINGS_SEARCH_ROWS.filter((item) => item.categoryId === category)) {
        if (!document.querySelector(`[data-settings-search-row-id="${row.id}"]`)) {
          missing.push(row.id);
        }
      }
      expect(missing).toEqual([]);
    });
    unmount();
    cleanup();
  }
});
