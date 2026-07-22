// @vitest-environment node

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dialog: { showOpenDialog: vi.fn() },
  persistSecurityScopedBookmark: vi.fn(),
  saveCurrentLibraryHome: vi.fn()
}));
let originalPlatform: PropertyDescriptor | undefined;

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => name === 'home' ? '/Users/tester' : '/app-data'),
    quit: vi.fn()
  },
  dialog: mocks.dialog
}));
vi.mock('./ipc/libraryPathBootstrap.js', () => ({
  hasBootstrapLibrarySelection: vi.fn(() => false),
  resolveDefaultBootstrapLibraryPaths: vi.fn(() => ({ database_path: '/container/Data/foliole.db' })),
  saveCurrentLibraryHome: mocks.saveCurrentLibraryHome
}));
vi.mock('./securityScopedBookmarks.js', () => ({
  persistSecurityScopedBookmark: mocks.persistSecurityScopedBookmark,
  shouldRequestSecurityScopedBookmarks: vi.fn(() => process.mas === true)
}));

import {
  confirmInitialLibrarySetup,
  initializeRuntimeServicesAfterLibrarySetup,
  loadInitialLibrarySetup,
  prepareInitialLibrarySetup,
  resetInitialLibrarySetupForTests,
  shouldRunInitialLibrarySetup
} from './initialLibrarySetup.js';

beforeEach(() => {
  vi.clearAllMocks();
  resetInitialLibrarySetupForTests();
  originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' });
  Object.defineProperty(process, 'mas', { configurable: true, value: false });
});

afterEach(() => {
  resetInitialLibrarySetupForTests();
  Object.defineProperty(process, 'mas', { configurable: true, value: false });
  if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
});

it('only requests setup for a fresh macOS library', () => {
  expect(shouldRunInitialLibrarySetup({
    defaultDatabaseExists: false,
    hasSelection: false,
    platform: 'darwin',
    requestedDatabaseExists: false
  })).toBe(true);
  expect(shouldRunInitialLibrarySetup({
    defaultDatabaseExists: true,
    hasSelection: false,
    platform: 'darwin',
    requestedDatabaseExists: false
  })).toBe(false);
  expect(shouldRunInitialLibrarySetup({
    defaultDatabaseExists: false,
    hasSelection: false,
    platform: 'win32',
    requestedDatabaseExists: false
  })).toBe(false);
});

it('commits the proposed Documents library before releasing startup', async () => {
  const preparation = prepareInitialLibrarySetup();
  const initialize = vi.fn().mockResolvedValue(undefined);
  const initialization = initializeRuntimeServicesAfterLibrarySetup(preparation, initialize);
  expect(preparation?.startupView).toEqual({ kind: 'library-setup' });
  expect(loadInitialLibrarySetup()).toMatchObject({
    display_path: '~/Documents/Foliole',
    library_home: '/Users/tester/Documents/Foliole'
  });
  expect(initialize).not.toHaveBeenCalled();

  await expect(confirmInitialLibrarySetup(null)).resolves.toEqual({ status: 'confirmed' });
  await expect(preparation?.completion).resolves.toBeUndefined();
  await expect(initialization).resolves.toBeUndefined();
  expect(initialize).toHaveBeenCalledOnce();
  expect(mocks.saveCurrentLibraryHome).toHaveBeenCalledWith('/Users/tester/Documents/Foliole');
});

it('uses the macOS directory panel and persists its bookmark in MAS builds', async () => {
  Object.defineProperty(process, 'mas', { configurable: true, value: true });
  mocks.dialog.showOpenDialog.mockResolvedValue({
    bookmarks: ['bookmark-data'],
    canceled: false,
    filePaths: ['/Users/tester/Documents']
  });
  prepareInitialLibrarySetup();

  await expect(confirmInitialLibrarySetup(null)).resolves.toEqual({ status: 'confirmed' });

  expect(mocks.dialog.showOpenDialog).toHaveBeenCalledOnce();
  expect(mocks.persistSecurityScopedBookmark).toHaveBeenCalledWith(
    '/Users/tester/Documents',
    'bookmark-data'
  );
  expect(mocks.saveCurrentLibraryHome).toHaveBeenCalledWith('/Users/tester/Documents/Foliole');
});
