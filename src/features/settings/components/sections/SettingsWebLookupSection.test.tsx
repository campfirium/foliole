import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { settingsDesktopAdapters } from '../../../../app/components/settingsDesktopAdapters';
import { APP_COMMAND_IDS } from '../../../../shared/commands/ids';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { getEnabledWebLookupEntries, getWebLookupEntries } from '../../../../shared/platform/webLookupEntries';
import { DocumentHeaderMenuSettingsProvider } from '../../context/DocumentHeaderMenuSettingsProvider';
import { loadEditorContextMenuOrder } from '../../model/editorContextMenuOrder';
import { loadEditorContextMenuItems } from '../../model/editorContextMenuSettings';

import { SettingsWebLookupSection } from './SettingsWebLookupSection';

beforeEach(() => {
  window.localStorage.clear();
});

it('shows built-in right-click menu items with DuckDuckGo disabled by default', () => {
  renderWithLocalization(<SettingsWebLookupSection />);

  expect(screen.getByRole('heading', { name: 'Right-click menu' })).toBeInTheDocument();
  expect(screen.getByDisplayValue('Chat with ChatGPT')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Search with Google')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Search with DuckDuckGo')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Show menu item: Search with DuckDuckGo' })).toHaveAttribute('aria-checked', 'false');
  expect(screen.queryByRole('button', { name: 'Remove Chat with ChatGPT' })).toBeNull();
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Chat with ChatGPT link' }).value)
    .toContain('{title}');
});

it('toggles whether an entry appears in the context menu', () => {
  renderWithLocalization(<SettingsWebLookupSection />);

  fireEvent.click(screen.getByRole('switch', { name: 'Show menu item: Search with DuckDuckGo' }));

  expect(getEnabledWebLookupEntries().map((entry) => entry.id)).toEqual([
    'chatgpt',
    'google',
    'duckduckgo'
  ]);
  expect(screen.getByRole('switch', { name: 'Hide menu item: Search with DuckDuckGo' })).toHaveAttribute('aria-checked', 'true');
});

it('updates the ChatGPT menu label and link', () => {
  renderWithLocalization(<SettingsWebLookupSection />);

  fireEvent.change(screen.getByRole('textbox', { name: 'Chat with ChatGPT menu label' }), {
    target: { value: 'Ask' }
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Ask link' }), {
    target: { value: 'https://chatgpt.com/?prompt=Ask:%0A{selection}' }
  });

  const chatgpt = getEnabledWebLookupEntries().find((entry) => entry.id === 'chatgpt');
  expect(chatgpt?.label).toBe('Ask');
  expect(chatgpt?.urlTemplate).toBe('https://chatgpt.com/?prompt=Ask:%0A{selection}');
});

it('adds and removes a custom menu item', () => {
  renderWithLocalization(<SettingsWebLookupSection />);

  fireEvent.click(screen.getByRole('button', { name: 'Add menu item' }));
  expect(screen.getByDisplayValue('New menu item')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Remove New menu item' }));
  expect(screen.queryByDisplayValue('New menu item')).toBeNull();
});

it('reorders menu items by dragging the handle', () => {
  renderWithLocalization(<SettingsWebLookupSection />);

  fireEvent.drop(screen.getByTestId('web-lookup-row-chatgpt'), {
    dataTransfer: { getData: () => 'lookup:google' }
  });

  expect(loadEditorContextMenuOrder(getWebLookupEntries(), loadEditorContextMenuItems()).slice(0, 2)).toEqual(['lookup:google', 'lookup:chatgpt']);
});

it('places a command among links in the same list and saves that order', () => {
  renderWithLocalization(<DocumentHeaderMenuSettingsProvider><SettingsWebLookupSection /></DocumentHeaderMenuSettingsProvider>);
  fireEvent.drop(screen.getByTestId('web-lookup-row-google'), {
    dataTransfer: { getData: () => 'command:system.repair-table' }
  });
  expect(loadEditorContextMenuOrder(getWebLookupEntries(), loadEditorContextMenuItems()).slice(0, 3)).toEqual([
    'lookup:chatgpt', 'command:system.repair-table', 'lookup:google'
  ]);
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.editorContextMenuOrder)).toContain('command:system.repair-table');
});

it('adds an existing action at the end of the shared list', () => {
  renderWithLocalization(<DocumentHeaderMenuSettingsProvider><SettingsWebLookupSection
    actionItems={[{ commandId: APP_COMMAND_IDS.findInTopic, isCustomized: false, primaryShortcutLabel: '', secondaryShortcutLabel: '', shortcutSummaryLabel: '', title: 'Find in Topic' }]}
    resolveDocumentMenuLabel={settingsDesktopAdapters.resolveDocumentMenuLabel}
  /></DocumentHeaderMenuSettingsProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Add action' }));
  fireEvent.click(screen.getByRole('button', { name: /Find in Topic/ }));
  expect(screen.getByTestId('context-command-row-user.document-findInTopic')).toBeInTheDocument();
  expect(loadEditorContextMenuOrder(getWebLookupEntries(), loadEditorContextMenuItems()).at(-1)).toBe('command:user.document-findInTopic');
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.documentHeaderMenuItems)).toBeNull();
});
