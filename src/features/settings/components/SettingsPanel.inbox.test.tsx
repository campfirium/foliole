import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { selectRuntimeImportDirectory } from '../../../shared/platform/importBridge';
import {
  loadRuntimeLibraryPathSettings,
  rebuildRuntimeMirrorAttachmentLinks,
  rebuildRuntimeMirrorOutput,
  updateRuntimeLibraryPathSetting
} from '../../../shared/platform/libraryPathsBridge';
import { listAvailableSystemFonts } from '../model/systemFonts';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

vi.mock('../model/systemFonts', () => ({
  listAvailableSystemFonts: vi.fn()
}));
vi.mock('../../../shared/platform/importBridge', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/platform/importBridge')>(
    '../../../shared/platform/importBridge'
  );
  return {
    ...actual,
    selectRuntimeImportDirectory: vi.fn()
  };
});
vi.mock('../../../shared/platform/libraryPathsBridge', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/platform/libraryPathsBridge')>(
    '../../../shared/platform/libraryPathsBridge'
  );
  return {
    ...actual,
    loadRuntimeLibraryPathSettings: vi.fn(),
    rebuildRuntimeMirrorAttachmentLinks: vi.fn(),
    rebuildRuntimeMirrorOutput: vi.fn(),
    updateRuntimeLibraryPathSetting: vi.fn()
  };
});

const mockedListAvailableSystemFonts = vi.mocked(listAvailableSystemFonts);
const mockedSelectRuntimeImportDirectory = vi.mocked(selectRuntimeImportDirectory);
const mockedLoadRuntimeLibraryPathSettings = vi.mocked(loadRuntimeLibraryPathSettings);
const mockedRebuildRuntimeMirrorAttachmentLinks = vi.mocked(rebuildRuntimeMirrorAttachmentLinks);
const mockedRebuildRuntimeMirrorOutput = vi.mocked(rebuildRuntimeMirrorOutput);
const mockedUpdateRuntimeLibraryPathSetting = vi.mocked(updateRuntimeLibraryPathSetting);

const defaultLibraryPaths = {
  assetsDir: 'C:\\Users\\Tester\\Documents\\Foliole\\Assets',
  dataDir: 'C:\\Users\\Tester\\Documents\\Foliole\\Data',
  databasePath: 'C:\\Users\\Tester\\Documents\\Foliole\\Data\\foliole.db',
  inbox: 'C:\\Users\\Tester\\Documents\\Foliole\\Inbox',
  libraryHome: 'C:\\Users\\Tester\\Documents\\Foliole',
  mirror: 'C:\\Users\\Tester\\Documents\\Foliole\\Mirror',
  updatedAt: '2026-03-30T00:00:00.000Z'
};

beforeEach(() => {
  window.localStorage.clear();
  window.electronAPI = undefined;
  mockedListAvailableSystemFonts.mockReset();
  mockedListAvailableSystemFonts.mockResolvedValue({ fonts: [], monospaceFonts: [] });
  mockedLoadRuntimeLibraryPathSettings.mockReset();
  mockedLoadRuntimeLibraryPathSettings.mockResolvedValue(defaultLibraryPaths);
  mockedRebuildRuntimeMirrorAttachmentLinks.mockReset();
  mockedRebuildRuntimeMirrorAttachmentLinks.mockResolvedValue({
    scannedDocumentCount: 2,
    rewrittenDocumentCount: 2,
    rewrittenLinkCount: 3,
    updatedAt: '2026-03-30T00:20:00.000Z'
  });
  mockedRebuildRuntimeMirrorOutput.mockReset();
  mockedRebuildRuntimeMirrorOutput.mockResolvedValue({
    queuedArticleCount: 2,
    rebuiltArticleCount: 2,
    failedArticleCount: 0,
    pendingArticleCount: 0,
    updatedAt: '2026-03-30T00:25:00.000Z'
  });
  mockedUpdateRuntimeLibraryPathSetting.mockReset();
  mockedUpdateRuntimeLibraryPathSetting.mockImplementation(async (location, nextPath) => {
    if (location === 'library_home') {
      const libraryHome = nextPath ?? defaultLibraryPaths.libraryHome;
      return {
        ...defaultLibraryPaths,
        assetsDir: `${libraryHome}\\Assets`,
        dataDir: `${libraryHome}\\Data`,
        databasePath: `${libraryHome}\\Data\\foliole.db`,
        inbox: `${libraryHome}\\Inbox`,
        libraryHome,
        mirror: `${libraryHome}\\Mirror`
      };
    }
    return {
      ...defaultLibraryPaths,
      [location === 'inbox' ? 'inbox' : 'mirror']: nextPath ?? defaultLibraryPaths[location === 'inbox' ? 'inbox' : 'mirror']
    };
  });
  mockedSelectRuntimeImportDirectory.mockReset();
  mockedSelectRuntimeImportDirectory.mockResolvedValue(null);
});

it('shows the default inbox path and lets the user choose a custom location through the runtime bridge', async () => {
  mockedSelectRuntimeImportDirectory.mockResolvedValue('D:\\Capture\\Inbox');

  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Library' }));

  await waitFor(() => {
    expect(screen.getByText('C:\\Users\\Tester\\Documents\\Foliole\\Inbox')).toBeInTheDocument();
  });

  fireEvent.click(screen.getAllByRole('button', { name: 'Change location' })[1] as HTMLButtonElement);

  await waitFor(() => {
    expect(screen.getByText('D:\\Capture\\Inbox')).toBeInTheDocument();
  });
  expect(mockedUpdateRuntimeLibraryPathSetting).toHaveBeenCalledWith('inbox', 'D:\\Capture\\Inbox');
  expect(window.localStorage.getItem('foliole-managed-inbox-path')).toBeNull();
});

it('restores the default inbox path through the runtime bridge', async () => {
  mockedLoadRuntimeLibraryPathSettings.mockResolvedValue({
    ...defaultLibraryPaths,
    inbox: 'D:\\Capture\\Inbox'
  });

  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Library' }));

  await waitFor(() => {
    expect(screen.getByText('D:\\Capture\\Inbox')).toBeInTheDocument();
  });

  fireEvent.click(screen.getAllByRole('button', { name: 'Restore default' })[1] as HTMLButtonElement);

  await waitFor(() => {
    expect(screen.getByText('C:\\Users\\Tester\\Documents\\Foliole\\Inbox')).toBeInTheDocument();
  });
  expect(mockedUpdateRuntimeLibraryPathSetting).toHaveBeenCalledWith('inbox', null);
});

it('shows Library Home, Inbox, and Mirror without exposing internal data folders', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Library' }));

  await waitFor(() => {
    expect(screen.getByText('Library Home')).toBeInTheDocument();
    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('Mirror')).toBeInTheDocument();
  });

  expect(screen.getByText(/drop folder for incoming files/i)).toBeInTheDocument();
  expect(screen.getByText(/should stay close to empty/i)).toBeInTheDocument();
  expect(screen.getByText(/runtime-generated markdown output folder/i)).toBeInTheDocument();
  expect(screen.getByText(/one `.md` per article/i)).toBeInTheDocument();
  expect(screen.getByText(/daily mirror output is incremental/i)).toBeInTheDocument();
  expect(screen.getByText(/database, data, and assets stay inside library home/i)).toBeInTheDocument();
  expect(screen.queryByText('Database location')).not.toBeInTheDocument();
  expect(screen.queryByText('Assets location')).not.toBeInTheDocument();
  expect(screen.queryByText('Data location')).not.toBeInTheDocument();
});

it('shows separate mirror output rebuild feedback from mirror link rebuild', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Library' }));

  await waitFor(() => {
    expect(screen.getByText('C:\\Users\\Tester\\Documents\\Foliole\\Mirror')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Rebuild mirror output' }));

  await waitFor(() => {
    expect(screen.getByText(/rebuilt 2 mirror article files from 2 queued articles/i)).toBeInTheDocument();
  });
  expect(mockedRebuildRuntimeMirrorOutput).toHaveBeenCalledTimes(1);
  expect(mockedRebuildRuntimeMirrorAttachmentLinks).not.toHaveBeenCalled();
});

it('updates Library Home and Mirror through the same runtime interface', async () => {
  mockedSelectRuntimeImportDirectory
    .mockResolvedValueOnce('E:\\LibraryRoot')
    .mockResolvedValueOnce('F:\\MirrorVault');

  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Library' }));

  await waitFor(() => {
    expect(screen.getByText('C:\\Users\\Tester\\Documents\\Foliole')).toBeInTheDocument();
  });

  fireEvent.click(screen.getAllByRole('button', { name: 'Change location' })[0] as HTMLButtonElement);

  await waitFor(() => {
    expect(screen.getByText('E:\\LibraryRoot')).toBeInTheDocument();
    expect(screen.getByText('E:\\LibraryRoot\\Mirror')).toBeInTheDocument();
  });

  fireEvent.click(screen.getAllByRole('button', { name: 'Change location' })[2] as HTMLButtonElement);

  await waitFor(() => {
    expect(screen.getByText('F:\\MirrorVault')).toBeInTheDocument();
  });

  expect(mockedUpdateRuntimeLibraryPathSetting).toHaveBeenNthCalledWith(1, 'library_home', 'E:\\LibraryRoot');
  expect(mockedUpdateRuntimeLibraryPathSetting).toHaveBeenNthCalledWith(2, 'mirror', 'F:\\MirrorVault');
});

it('runs the explicit mirror link rebuild flow from settings', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Library' }));

  await waitFor(() => {
    expect(screen.getByText('C:\\Users\\Tester\\Documents\\Foliole\\Mirror')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Rebuild mirror links' }));

  await waitFor(() => {
    expect(screen.getByText('Rebuilt 3 mirror attachment links across 2 documents.')).toBeInTheDocument();
  });
  expect(mockedRebuildRuntimeMirrorAttachmentLinks).toHaveBeenCalledTimes(1);
});
