import fs from 'node:fs';
import path from 'node:path';

import { app, dialog, type BrowserWindow, type OpenDialogOptions } from 'electron';

import { LIBRARY_DATABASE_FILENAME, LIBRARY_DATA_DIRNAME, LIBRARY_HOME_DEFAULT_DIRNAME } from '../lib/platform/libraryPaths.js';
import type { NativeInitialLibrarySetupState } from '../lib/platform/nativeInitialLibrarySetupContract.js';

import { hasBootstrapLibrarySelection, resolveDefaultBootstrapLibraryPaths, saveCurrentLibraryHome } from './ipc/libraryPathBootstrap.js';
import { persistSecurityScopedBookmark, shouldRequestSecurityScopedBookmarks } from './securityScopedBookmarks.js';

interface SelectedParentAuthorization {
  bookmark?: string;
  parentPath: string;
}

interface InitialLibrarySetupSession {
  authorization: SelectedParentAuthorization | null;
  completion: Promise<void>;
  libraryHome: string;
  resolveCompletion: () => void;
}

export interface InitialLibrarySetupPreparation {
  completion: Promise<void>;
  startupView: { kind: 'library-setup' };
}

let activeSession: InitialLibrarySetupSession | null = null;

function joinMacPath(basePath: string, ...parts: string[]) {
  const pathApi = basePath.includes('\\') ? path.win32 : path.posix;
  return pathApi.join(basePath, ...parts);
}

function resolveRequestedDefaultLibraryHome() {
  const testStateRoot = process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT;
  if (testStateRoot && path.isAbsolute(testStateRoot)) {
    return path.join(testStateRoot, 'Documents', LIBRARY_HOME_DEFAULT_DIRNAME);
  }
  return joinMacPath(app.getPath('home'), 'Documents', LIBRARY_HOME_DEFAULT_DIRNAME);
}

function defaultDatabaseExistsOutsideTestIsolation() {
  const testStateRoot = process.env.FOLIOLE_ELECTRON_TEST_STATE_ROOT;
  if (testStateRoot && path.isAbsolute(testStateRoot)) {
    return false;
  }
  return fs.existsSync(resolveDefaultBootstrapLibraryPaths().database_path);
}

export function shouldRunInitialLibrarySetup(input: {
  defaultDatabaseExists: boolean;
  hasSelection: boolean;
  platform: NodeJS.Platform;
  requestedDatabaseExists: boolean;
}) {
  return input.platform === 'darwin' && !input.hasSelection &&
    !input.defaultDatabaseExists && !input.requestedDatabaseExists;
}

export function prepareInitialLibrarySetup(): InitialLibrarySetupPreparation | null {
  if (process.platform !== 'darwin') {
    return null;
  }
  if (activeSession) {
    return { completion: activeSession.completion, startupView: { kind: 'library-setup' } };
  }
  const requestedHome = resolveRequestedDefaultLibraryHome();
  const requestedDatabase = joinMacPath(requestedHome, LIBRARY_DATA_DIRNAME, LIBRARY_DATABASE_FILENAME);
  if (!shouldRunInitialLibrarySetup({
    defaultDatabaseExists: defaultDatabaseExistsOutsideTestIsolation(),
    hasSelection: hasBootstrapLibrarySelection(),
    platform: process.platform,
    requestedDatabaseExists: fs.existsSync(requestedDatabase)
  })) {
    return null;
  }
  let resolveCompletion!: () => void;
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve;
  });
  activeSession = { authorization: null, completion, libraryHome: requestedHome, resolveCompletion };
  return { completion, startupView: { kind: 'library-setup' } };
}

function requireActiveSession() {
  if (!activeSession) {
    throw new Error('Initial library setup is not active.');
  }
  return activeSession;
}

function formatDisplayPath(libraryHome: string) {
  const home = app.getPath('home');
  const separator = home.includes('\\') ? path.win32.sep : path.posix.sep;
  return libraryHome === home || libraryHome.startsWith(`${home}${separator}`)
    ? `~${libraryHome.slice(home.length)}`
    : libraryHome;
}

function createSetupState(session = requireActiveSession()): NativeInitialLibrarySetupState {
  return {
    display_path: formatDisplayPath(session.libraryHome),
    library_home: session.libraryHome,
    requires_system_confirmation: shouldRequestSecurityScopedBookmarks() && !session.authorization
  };
}

async function selectParentDirectory(window: BrowserWindow | null) {
  const session = requireActiveSession();
  const options: OpenDialogOptions = {
    buttonLabel: 'Choose',
    defaultPath: session.libraryHome.includes('\\')
      ? path.win32.dirname(session.libraryHome)
      : path.posix.dirname(session.libraryHome),
    message: 'Choose the folder that will contain the Foliole library.',
    properties: ['openDirectory', 'createDirectory'],
    securityScopedBookmarks: shouldRequestSecurityScopedBookmarks()
  };
  const selection = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  if (selection.canceled || !selection.filePaths[0]) {
    return false;
  }
  const parentPath = selection.filePaths[0];
  session.libraryHome = joinMacPath(parentPath, LIBRARY_HOME_DEFAULT_DIRNAME);
  session.authorization = {
    parentPath,
    ...(selection.bookmarks?.[0] ? { bookmark: selection.bookmarks[0] } : {})
  };
  return true;
}

export function loadInitialLibrarySetup() {
  return createSetupState();
}

export async function chooseInitialLibraryLocation(window: BrowserWindow | null) {
  if (!await selectParentDirectory(window)) {
    return { status: 'canceled' as const };
  }
  return { state: createSetupState(), status: 'selected' as const };
}

function assertLibraryDestinationAvailable(libraryHome: string) {
  if (!fs.existsSync(libraryHome)) {
    return;
  }
  const databasePath = joinMacPath(libraryHome, LIBRARY_DATA_DIRNAME, LIBRARY_DATABASE_FILENAME);
  if (fs.existsSync(databasePath)) {
    throw new Error('A Foliole library already exists at this location.');
  }
  const entries = fs.readdirSync(libraryHome).filter((entry) => entry !== '.DS_Store');
  if (entries.length > 0) {
    throw new Error('The Foliole library folder must be empty.');
  }
}

export async function confirmInitialLibrarySetup(window: BrowserWindow | null) {
  const session = requireActiveSession();
  if (shouldRequestSecurityScopedBookmarks() && !session.authorization) {
    if (!await selectParentDirectory(window)) {
      return { status: 'canceled' as const };
    }
  }
  assertLibraryDestinationAvailable(session.libraryHome);
  if (session.authorization) {
    persistSecurityScopedBookmark(session.authorization.parentPath, session.authorization.bookmark);
  }
  saveCurrentLibraryHome(session.libraryHome);
  session.resolveCompletion();
  activeSession = null;
  return { status: 'confirmed' as const };
}

export function resetInitialLibrarySetupForTests() {
  activeSession = null;
}

export function quitIfInitialLibrarySetupIsAbandoned(
  preparation: InitialLibrarySetupPreparation | null,
  window: BrowserWindow
) {
  if (!preparation) return;
  const quit = () => app.quit();
  window.once('closed', quit);
  void preparation.completion.then(() => window.off('closed', quit));
}

export async function initializeRuntimeServicesAfterLibrarySetup(
  preparation: InitialLibrarySetupPreparation | null,
  initialize: () => Promise<void>,
  afterInitialize?: () => void
) {
  await preparation?.completion;
  await initialize();
  afterInitialize?.();
}
