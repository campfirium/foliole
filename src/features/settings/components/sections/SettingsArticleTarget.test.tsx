import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../../../lib/platform/nativeCommands';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { renderWithLocalization } from '../../../../shared/localization/testLocalization';
import { DocumentHeaderMenuSettingsProvider } from '../../context/DocumentHeaderMenuSettingsProvider';

import { SettingsWebLookupSection } from './SettingsWebLookupSection';

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

it('inserts the destination before Clean formatting in an existing menu and updates the label after choosing an app', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.editorContextMenuOrder, JSON.stringify([
    'lookup:chatgpt', 'command:system.clean-formatting', 'lookup:google'
  ]));
  const edge = { id: 'edge', name: 'Edge' };
  const firefox = { id: 'firefox', name: 'Firefox' };
  const available = [edge, firefox];
  const invoke = vi.fn(async (command: string) => ({
    available, selected: command === NATIVE_COMMANDS.selectArticleTarget ? firefox : edge
  }));
  vi.stubGlobal('electronAPI', { invoke });
  renderWithLocalization(<DocumentHeaderMenuSettingsProvider><SettingsWebLookupSection /></DocumentHeaderMenuSettingsProvider>);

  const row = screen.getByTestId('context-command-row-system.send-to-edge');
  const clean = screen.getByTestId('context-command-row-system.clean-formatting');
  expect(row.compareDocumentPosition(clean) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const selector = within(row).getByRole('combobox', { name: 'Article destination' });
  await within(selector).findByRole('option', { name: 'Firefox' });
  expect(within(selector).queryByRole('option', { name: 'Chrome' })).toBeNull();
  fireEvent.change(selector, { target: { value: 'firefox' } });

  expect(await within(row).findByText('Send Article to Firefox')).toBeInTheDocument();
  expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.selectArticleTarget, { id: 'firefox' });
});
