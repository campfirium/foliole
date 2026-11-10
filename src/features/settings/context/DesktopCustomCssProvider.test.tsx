import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { SettingsPanel } from '../components/SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from '../components/SettingsPanel.testUtils';

import { DesktopCustomCssProvider } from './DesktopCustomCssProvider';

const { listCssSnippetFiles, openCssSnippetFolder } = vi.hoisted(() => ({
  listCssSnippetFiles: vi.fn(),
  openCssSnippetFolder: vi.fn()
}));

vi.mock('../../../shared/platform/desktop/cssSnippetFiles', () => ({ listCssSnippetFiles, openCssSnippetFolder }));
vi.mock('../../../shared/platform/runtime', () => ({ isDesktopRuntime: () => true }));

async function openAppearance() {
  const app = renderWithMouseGestureProvider(
    <DesktopCustomCssProvider>
      <aside data-testid="sidebar">Workspace</aside>
      <SettingsPanel {...createProps()} requestedCategory="about" />
    </DesktopCustomCssProvider>
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Search settings' }), {
    target: { value: 'Custom CSS snippets' }
  });
  fireEvent.click(await screen.findByRole('option', { name: /Custom CSS snippets/ }));
  await screen.findByRole('button', { name: 'Open snippets folder' });
  return app;
}

function sidebarColor() {
  return getComputedStyle(screen.getByTestId('sidebar')).color;
}

beforeEach(() => {
  window.localStorage.clear();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

const folder = '/library/Widgets/CSS Snippets';

it('loads file snippets from Appearance, persists enablement, and recovers when the file is removed', async () => {
  listCssSnippetFiles.mockResolvedValue({ path: folder, files: [] });
  const first = await openAppearance();
  fireEvent.click(screen.getByRole('button', { name: 'Open snippets folder' }));
  expect(openCssSnippetFolder).toHaveBeenCalled();
  expect(screen.queryByText(/No snippets yet/)).toBeNull();
  expect(screen.queryByRole('textbox', { name: /Search snippets/ })).toBeNull();

  listCssSnippetFiles.mockResolvedValue({
    path: folder, files: [{ name: 'sidebar.css', sourceCss: 'aside { color: red; }' }]
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh snippets' }));
  const toggle = await screen.findByRole('switch', { name: 'sidebar.css' });
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  const section = screen.getByRole('region', { name: 'Custom CSS snippets' });
  expect(within(section).getByRole('button', { name: 'Preview' })).toBeEnabled();
  const search = screen.getByRole('textbox', { name: /Search snippets/ });
  fireEvent.change(search, { target: { value: 'other' } });
  expect(screen.getByText('No matching snippets.')).toBeInTheDocument();
  fireEvent.change(search, { target: { value: 'side' } });
  fireEvent.click(screen.getByRole('switch', { name: 'sidebar.css' }));
  await waitFor(() => expect(sidebarColor()).toBe('rgb(255, 0, 0)'));

  const dialog = screen.getByLabelText('Settings dialog');
  fireEvent.click(within(section).getByRole('button', { name: 'Preview' }));
  expect(dialog).toHaveAttribute('inert');
  expect(sidebarColor()).toBe('rgb(255, 0, 0)');
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(dialog).not.toHaveAttribute('inert');
  expect(within(section).getByRole('textbox', { name: /Search snippets/ })).toHaveValue('side');
  expect(within(section).getByRole('switch', { name: 'sidebar.css' })).toHaveAttribute('aria-checked', 'true');

  listCssSnippetFiles.mockResolvedValue({
    path: folder, files: [{ name: 'sidebar.css', sourceCss: 'aside { color: blue; }' }]
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh snippets' }));
  await waitFor(() => expect(sidebarColor()).toBe('rgb(0, 0, 255)'));
  first.unmount();

  const reopened = await openAppearance();
  await waitFor(() => expect(sidebarColor()).toBe('rgb(0, 0, 255)'));
  reopened.unmount();

  listCssSnippetFiles.mockResolvedValue({ path: folder, files: [] });
  await openAppearance();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh snippets' })).toBeEnabled());
  expect(screen.queryByRole('switch', { name: 'sidebar.css' })).toBeNull();
  expect(sidebarColor()).not.toBe('rgb(0, 0, 255)');
});
