import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { resolveRuntimeAppPaths } from '../../../shared/platform/bridge';
import { selectRuntimeImportDirectory } from '../../../shared/platform/importBridge';
import { listAvailableSystemFonts } from '../model/systemFonts';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

vi.mock('../model/systemFonts', () => ({
  listAvailableSystemFonts: vi.fn()
}));
vi.mock('../../../shared/platform/bridge', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/platform/bridge')>(
    '../../../shared/platform/bridge'
  );
  return {
    ...actual,
    resolveRuntimeAppPaths: vi.fn()
  };
});
vi.mock('../../../shared/platform/importBridge', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/platform/importBridge')>(
    '../../../shared/platform/importBridge'
  );
  return {
    ...actual,
    selectRuntimeImportDirectory: vi.fn()
  };
});

const mockedListAvailableSystemFonts = vi.mocked(listAvailableSystemFonts);
const mockedResolveRuntimeAppPaths = vi.mocked(resolveRuntimeAppPaths);
const mockedSelectRuntimeImportDirectory = vi.mocked(selectRuntimeImportDirectory);

beforeEach(() => {
  window.localStorage.clear();
  window.electronAPI = undefined;
  mockedListAvailableSystemFonts.mockReset();
  mockedListAvailableSystemFonts.mockResolvedValue({ fonts: [], monospaceFonts: [] });
  mockedResolveRuntimeAppPaths.mockReset();
  mockedResolveRuntimeAppPaths.mockResolvedValue({
    appCacheDir: '/tmp/cache',
    appConfigDir: '/tmp/config',
    appDataDir: 'C:\\Users\\Tester\\AppData\\Roaming\\Foliole',
    appLogDir: '/tmp/logs'
  });
  mockedSelectRuntimeImportDirectory.mockReset();
  mockedSelectRuntimeImportDirectory.mockResolvedValue(null);
});

it('shows the default inbox path and lets the user choose a custom location', async () => {
  mockedSelectRuntimeImportDirectory.mockResolvedValue('D:\\Capture\\Inbox');

  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Import' }));

  await waitFor(() => {
    expect(screen.getByText('C:\\Users\\Tester\\AppData\\Roaming\\Foliole\\inbox')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Change location' }));

  await waitFor(() => {
    expect(screen.getByText('D:\\Capture\\Inbox')).toBeInTheDocument();
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.managedInboxPath)).toBe('D:\\Capture\\Inbox');
  });
});

it('restores the default inbox path and clears the stored override', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.managedInboxPath, 'D:\\Capture\\Inbox');

  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Import' }));

  await waitFor(() => {
    expect(screen.getByText('D:\\Capture\\Inbox')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Restore default' }));

  await waitFor(() => {
    expect(screen.getByText('C:\\Users\\Tester\\AppData\\Roaming\\Foliole\\inbox')).toBeInTheDocument();
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.managedInboxPath)).toBeNull();
  });
});
