import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { preloadTranslationCatalog } from '../shared/localization/translations';
import { useWorkspaceStore } from '../store/workspaceStore';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
  await preloadTranslationCatalog('zh-Hans');
});

afterEach(() => vi.restoreAllMocks());

function mockBrowserPlatform(platform: string) {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(platform);
}

function openRightPanelFromMenu(label: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: 'More right sidebar panels' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(label, 'i') }));
}

it('toggles both sidebars from the titlebar buttons', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Toggle left panel' }));
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(true);
  expect(screen.queryByRole('complementary', { name: 'Topic list panel' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Left toolbar' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Toggle left panel' }));
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(false);
  expect(screen.getByRole('region', { name: 'Left toolbar' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Toggle right sidebar' }));
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(true);
  expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Flow panel' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'More right sidebar panels' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Toggle right sidebar' }));
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(false);
  expect(screen.getByRole('button', { name: 'Flow panel' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'More right sidebar panels' })).toBeInTheDocument();
});

it('keeps the workspace stable when switching right panels after collapsing the left panel', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Toggle left panel' }));
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(true);

  openRightPanelFromMenu('Backlinks');
  expect(screen.getByRole('button', { name: 'More right sidebar panels' })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(screen.getByRole('button', { name: 'Toggle right sidebar' }));
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(true);

  fireEvent.click(screen.getByRole('button', { name: 'Toggle right sidebar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Flow panel' }));

  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(false);
  expect(screen.getByRole('button', { name: 'Flow panel' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('main', { name: 'Foliole workspace' })).toBeInTheDocument();
});

it.each(['Win32', 'Linux x86_64'])('toggles sidebars from non-editing bracket shortcuts on %s', (platform) => {
  mockBrowserPlatform(platform);
  render(<App />);

  fireEvent.keyDown(window, { key: '[' });
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(true);

  fireEvent.keyDown(window, { key: ']' });
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(true);

  fireEvent.keyDown(window, { key: '\\' });
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(false);
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(false);

  fireEvent.keyDown(window, { key: '\\' });
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(true);
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(true);
});

it('uses the macOS left sidebar shortcut without assigning bare bracket defaults', () => {
  mockBrowserPlatform('MacIntel');
  render(<App />);

  for (const key of ['[', ']', '\\']) {
    fireEvent.keyDown(window, { key });
    expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(false);
    expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(false);
  }

  fireEvent.keyDown(window, { key: 'l', metaKey: true, shiftKey: true });
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(true);
  expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(false);

  fireEvent.keyDown(window, { key: 'l', metaKey: true, shiftKey: true });
  expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(false);
});

it.each(['Win32', 'Linux x86_64'])('keeps bracket input from toggling sidebars while editing on %s', (platform) => {
  mockBrowserPlatform(platform);
  render(<App />);
  const editor = screen.getByTestId('editor-value');
  editor.focus();
  expect(editor).toHaveFocus();

  for (const key of ['[', ']', '\\']) {
    fireEvent.keyDown(editor, { key });
    expect(useWorkspaceStore.getState().layout.isListCollapsed).toBe(false);
    expect(useWorkspaceStore.getState().layout.isRightSidebarCollapsed).toBe(false);
  }
});
