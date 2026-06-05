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

it('updates settings navigation and search results when the app language changes', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="appearance" />);

  fireEvent.change(screen.getByLabelText('App language'), { target: { value: 'zh-Hans' } });

  expect(screen.getByRole('heading', { name: '外观' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '关于' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '通用' })).toBeInTheDocument();

  const input = screen.getByRole('textbox', { name: '搜索设置' });
  fireEvent.change(input, { target: { value: '目标保持率' } });
  fireEvent.click(screen.getByRole('option', { name: /目标保持率/ }));

  await waitFor(() => {
    expect(document.querySelector('[data-settings-search-row-id="review-desired-retention"]')).not.toBeNull();
  });
  expect(screen.getByRole('button', { name: '复习' })).toHaveAttribute('aria-current', 'page');

  fireEvent.click(screen.getByRole('button', { name: '鼠标手势' }));
  expect(screen.getAllByText('生效区域').length).toBeGreaterThan(0);
  expect(screen.getByText('线条颜色')).toBeInTheDocument();
  expect(screen.getByText('方向阈值（px）')).toBeInTheDocument();
  expect(screen.queryByText('Active area')).not.toBeInTheDocument();
  expect(screen.queryByText('Line color')).not.toBeInTheDocument();
  expect(screen.queryByText('Direction threshold (px)')).not.toBeInTheDocument();
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

  fireEvent.mouseDown(screen.getByRole('heading', { name: 'About' }));
  expect(screen.queryByRole('listbox', { name: 'Settings search results' })).not.toBeInTheDocument();

  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'Mirror' } });
  fireEvent.keyDown(window, { key: 'Escape', bubbles: true });
  expect(screen.queryByRole('listbox', { name: 'Settings search results' })).not.toBeInTheDocument();
  expect(input).toHaveValue('');
});

it('keeps the settings search field in the top bar', () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="about" />);
  const input = screen.getByRole('textbox', { name: 'Search settings' });
  const searchRoot = input.parentElement?.parentElement;
  const topBar = searchRoot?.parentElement;

  expect(searchRoot).toHaveClass('relative');
  expect(searchRoot).not.toHaveClass('absolute');
  expect(topBar).toHaveClass('justify-end');
  expect(topBar).toHaveClass('border-b');
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
