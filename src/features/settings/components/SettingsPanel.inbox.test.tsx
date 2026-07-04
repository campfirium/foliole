import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { selectRuntimeFolder } from '../../../shared/platform/folderSelectionRuntimeRepository';
import {
  loadRuntimeLibraryPathSettings,
  rebuildRuntimeMirrorAttachmentLinks,
  rebuildRuntimeMirrorOutput,
  updateRuntimeLibraryPathSetting
} from '../../../shared/platform/libraryPathsRuntimeRepository';
import { listAvailableSystemFonts } from '../model/systemFonts';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

vi.mock('../model/systemFonts', () => ({
  listAvailableSystemFonts: vi.fn()
}));
vi.mock('../../../shared/platform/folderSelectionRuntimeRepository', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/platform/folderSelectionRuntimeRepository')>(
    '../../../shared/platform/folderSelectionRuntimeRepository'
  );
  return {
    ...actual,
    selectRuntimeFolder: vi.fn()
  };
});
vi.mock('../../../shared/platform/libraryPathsRuntimeRepository', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/platform/libraryPathsRuntimeRepository')>(
    '../../../shared/platform/libraryPathsRuntimeRepository'
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
const mockedSelectRuntimeFolder = vi.mocked(selectRuntimeFolder);
const mockedLoadRuntimeLibraryPathSettings = vi.mocked(loadRuntimeLibraryPathSettings);
const mockedRebuildRuntimeMirrorAttachmentLinks = vi.mocked(rebuildRuntimeMirrorAttachmentLinks);
const mockedRebuildRuntimeMirrorOutput = vi.mocked(rebuildRuntimeMirrorOutput);
const mockedUpdateRuntimeLibraryPathSetting = vi.mocked(updateRuntimeLibraryPathSetting);

const defaultLibraryPaths = {
  assetsDir: 'C:\\Users\\Tester\\Documents\\Foliole\\Assets',
  dataDir: 'C:\\Users\\Tester\\Documents\\Foliole\\Data',
  databasePath: 'C:\\Users\\Tester\\Documents\\Foliole\\Data\\foliole.db',
  inbox: 'C:\\Users\\Tester\\Documents\\Foliole\\Import\\Inbox',
  libraryHome: 'C:\\Users\\Tester\\Documents\\Foliole',
  mirror: 'C:\\Users\\Tester\\Documents\\Foliole\\Mirror',
  updatedAt: '2026-03-30T00:00:00.000Z'
};
let currentLibraryPaths = defaultLibraryPaths;

function clickChangeForPath(pathTitle: string) {
  fireEvent.click(screen.getByTitle(pathTitle));
}

function clickRestoreForPath(pathTitle: string) {
  const control = screen.getByTitle(pathTitle).closest('[data-settings-path-control]');
  expect(control).not.toBeNull();
  fireEvent.click(within(control as HTMLElement).getByRole('button', { name: 'Restore default' }));
}

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
  mockedListAvailableSystemFonts.mockReset();
  mockedListAvailableSystemFonts.mockResolvedValue({ fonts: [], monospaceFonts: [] });
  mockedLoadRuntimeLibraryPathSettings.mockReset();
  currentLibraryPaths = defaultLibraryPaths;
  mockedLoadRuntimeLibraryPathSettings.mockImplementation(async () => currentLibraryPaths);
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
      currentLibraryPaths = {
        ...currentLibraryPaths,
        assetsDir: `${libraryHome}\\Assets`,
        dataDir: `${libraryHome}\\Data`,
        databasePath: `${libraryHome}\\Data\\foliole.db`,
        inbox: `${libraryHome}\\Import\\Inbox`,
        libraryHome,
        mirror: `${libraryHome}\\Mirror`
      };
      return currentLibraryPaths;
    }
    if (location === 'assets_dir') {
      currentLibraryPaths = {
        ...currentLibraryPaths,
        assetsDir: nextPath ?? defaultLibraryPaths.assetsDir
      };
      return currentLibraryPaths;
    }
    currentLibraryPaths = {
      ...currentLibraryPaths,
      [location === 'inbox' ? 'inbox' : 'mirror']:
        nextPath ?? defaultLibraryPaths[location === 'inbox' ? 'inbox' : 'mirror']
    };
    return currentLibraryPaths;
  });
  mockedSelectRuntimeFolder.mockReset();
  mockedSelectRuntimeFolder.mockResolvedValue(null);
});

it('shows the default inbox path and lets the user choose a custom location through the runtime bridge', async () => {
  mockedSelectRuntimeFolder.mockResolvedValue('D:\\Capture\\Inbox');

  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Storage' }));

  await waitFor(() => {
    expect(screen.getByTitle('C:\\Users\\Tester\\Documents\\Foliole\\Import\\Inbox')).toBeInTheDocument();
  });

  clickChangeForPath('C:\\Users\\Tester\\Documents\\Foliole\\Import\\Inbox');

  await waitFor(() => {
    expect(screen.getByTitle('D:\\Capture\\Inbox')).toBeInTheDocument();
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

  fireEvent.click(screen.getByRole('button', { name: 'Storage' }));

  await waitFor(() => {
    expect(screen.getByTitle('D:\\Capture\\Inbox')).toBeInTheDocument();
  });

  clickRestoreForPath('D:\\Capture\\Inbox');

  await waitFor(() => {
    expect(screen.getByTitle('C:\\Users\\Tester\\Documents\\Foliole\\Import\\Inbox')).toBeInTheDocument();
  });
  expect(mockedUpdateRuntimeLibraryPathSetting).toHaveBeenCalledWith('inbox', null);
});

it('shows Import and Storage folders without exposing internal data folders', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Storage' }));

  await waitFor(() => {
    expect(screen.getByText('Main folder')).toBeInTheDocument();
    expect(screen.getAllByText('Attachments folder').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inbox folder').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Import folder').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mirror folder').length).toBeGreaterThan(0);
  });

  expect(screen.getByText(/Stores the database and app data/i)).toBeInTheDocument();
  expect(screen.getByText(/Files placed here are imported as topics/i)).toBeInTheDocument();
  expect(screen.getByText(/Create folders here to import files into matching Foliole folders/i)).toBeInTheDocument();
  expect(screen.getByText(/Use after recovery or mirror rule changes/i)).toBeInTheDocument();
  expect(screen.getByText(/Use after moving the mirror folder/i)).toBeInTheDocument();
  expect(screen.getByText('Mirror maintenance')).toBeInTheDocument();
  expect(screen.getByText(/Stores images, PDFs, EPUBs/i)).toBeInTheDocument();
  expect(screen.queryByText('Database location')).not.toBeInTheDocument();
  expect(screen.queryByText('Data subfolder')).not.toBeInTheDocument();
});

it('shows separate mirror output rebuild feedback from mirror link rebuild', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Storage' }));

  await waitFor(() => {
    expect(screen.getByTitle('C:\\Users\\Tester\\Documents\\Foliole\\Mirror')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Rebuild mirror' }));

  await waitFor(() => {
    expect(screen.getByText(/rebuilt 2 mirror article files from 2 queued articles/i)).toBeInTheDocument();
  });
  expect(mockedRebuildRuntimeMirrorOutput).toHaveBeenCalledTimes(1);
  expect(mockedRebuildRuntimeMirrorAttachmentLinks).not.toHaveBeenCalled();
});

it('updates Main folder, Attachments folder, and Mirror folder through the same runtime interface', async () => {
  mockedSelectRuntimeFolder
    .mockResolvedValueOnce('E:\\LibraryRoot')
    .mockResolvedValueOnce('G:\\AttachmentVault')
    .mockResolvedValueOnce('F:\\MirrorVault');

  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Storage' }));

  await waitFor(() => {
    expect(screen.getByTitle('C:\\Users\\Tester\\Documents\\Foliole')).toBeInTheDocument();
  });

  clickChangeForPath('C:\\Users\\Tester\\Documents\\Foliole');

  await waitFor(() => {
    expect(screen.getByTitle('E:\\LibraryRoot')).toBeInTheDocument();
    expect(screen.getByTitle('E:\\LibraryRoot\\Mirror')).toBeInTheDocument();
  });

  clickChangeForPath('E:\\LibraryRoot\\Assets');

  await waitFor(() => {
    expect(screen.getByTitle('G:\\AttachmentVault')).toBeInTheDocument();
  });

  clickChangeForPath('E:\\LibraryRoot\\Mirror');

  await waitFor(() => {
    expect(screen.getByTitle('F:\\MirrorVault')).toBeInTheDocument();
  });

  expect(mockedUpdateRuntimeLibraryPathSetting).toHaveBeenNthCalledWith(1, 'library_home', 'E:\\LibraryRoot');
  expect(mockedUpdateRuntimeLibraryPathSetting).toHaveBeenNthCalledWith(2, 'assets_dir', 'G:\\AttachmentVault');
  expect(mockedUpdateRuntimeLibraryPathSetting).toHaveBeenNthCalledWith(3, 'mirror', 'F:\\MirrorVault');
});

it('restores the default assets path through the runtime bridge', async () => {
  mockedLoadRuntimeLibraryPathSettings.mockResolvedValue({
    ...defaultLibraryPaths,
    assetsDir: 'G:\\AttachmentVault'
  });

  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Storage' }));

  await waitFor(() => {
    expect(screen.getByTitle('G:\\AttachmentVault')).toBeInTheDocument();
  });

  clickRestoreForPath('G:\\AttachmentVault');

  await waitFor(() => {
    expect(screen.getByTitle('C:\\Users\\Tester\\Documents\\Foliole\\Assets')).toBeInTheDocument();
  });
  expect(mockedUpdateRuntimeLibraryPathSetting).toHaveBeenCalledWith('assets_dir', null);
});

it('runs the explicit mirror link rebuild flow from settings', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Storage' }));

  await waitFor(() => {
    expect(screen.getByTitle('C:\\Users\\Tester\\Documents\\Foliole\\Mirror')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Repair mirror links' }));

  await waitFor(() => {
    expect(screen.getByText('Rebuilt 3 mirror attachment links across 2 documents.')).toBeInTheDocument();
  });
  expect(mockedRebuildRuntimeMirrorAttachmentLinks).toHaveBeenCalledTimes(1);
});
