import { useEffect, useState } from 'react';

import { selectRuntimeImportDirectory } from '../../../shared/platform/importBridge';
import {
  loadRuntimeLibraryPathSettings,
  updateRuntimeLibraryPathSetting,
  type RuntimeLibraryPathLocation,
  type RuntimeLibraryPaths
} from '../../../shared/platform/libraryPathsBridge';

import { useMirrorRebuildState } from './useMirrorRebuildState';

type LibraryPathErrorState = Record<RuntimeLibraryPathLocation, string | null>;

function createEmptyErrors(): LibraryPathErrorState {
  return {
    assets_dir: null,
    inbox: null,
    library_home: null,
    mirror: null
  };
}

function createUnavailablePaths(): RuntimeLibraryPaths {
  return {
    assetsDir: 'Unavailable',
    dataDir: 'Unavailable',
    databasePath: 'Unavailable',
    inbox: 'Unavailable',
    libraryHome: 'Unavailable',
    mirror: 'Unavailable',
    updatedAt: '1970-01-01T00:00:00.000Z'
  };
}

function getChangeErrorMessage(location: RuntimeLibraryPathLocation) {
  if (location === 'library_home') {
    return 'Could not choose a new Library Home folder.';
  }
  if (location === 'assets_dir') {
    return 'Could not choose a new Assets folder.';
  }
  if (location === 'mirror') {
    return 'Could not choose a new Mirror folder.';
  }
  return 'Could not choose a new Inbox folder.';
}

function getRestoreErrorMessage(location: RuntimeLibraryPathLocation) {
  if (location === 'library_home') {
    return 'Could not restore the default Library Home folder.';
  }
  if (location === 'assets_dir') {
    return 'Could not restore the default Assets folder.';
  }
  if (location === 'mirror') {
    return 'Could not restore the default Mirror folder.';
  }
  return 'Could not restore the default Inbox folder.';
}

function formatLocationError(
  fallbackMessage: string,
  error: unknown
) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${fallbackMessage} ${error.message}`;
  }
  return fallbackMessage;
}

function clearLocationError(
  errors: LibraryPathErrorState,
  location: RuntimeLibraryPathLocation
): LibraryPathErrorState {
  return {
    ...errors,
    [location]: null
  };
}

async function runLocationUpdate(args: {
  getErrorMessage: (location: RuntimeLibraryPathLocation) => string;
  location: RuntimeLibraryPathLocation;
  performUpdate: () => Promise<RuntimeLibraryPaths>;
  resetMirrorRebuildState: () => void;
  setErrors: (value: (current: LibraryPathErrorState) => LibraryPathErrorState) => void;
  setPaths: (value: RuntimeLibraryPaths) => void;
  setPendingLocation: (value: RuntimeLibraryPathLocation | null) => void;
}) {
  args.setErrors((current) => clearLocationError(current, args.location));
  if (args.location === 'mirror') {
    args.resetMirrorRebuildState();
  }
  args.setPendingLocation(args.location);
  try {
    args.setPaths(await args.performUpdate());
  } catch (error) {
    args.setErrors((current) => ({
      ...current,
      [args.location]: formatLocationError(args.getErrorMessage(args.location), error)
    }));
  } finally {
    args.setPendingLocation(null);
  }
}

function useInitialLibraryPathSettings(
  setIsDesktopRuntime: (value: boolean) => void,
  setPaths: (value: RuntimeLibraryPaths) => void
) {
  useEffect(() => {
    let alive = true;
    loadRuntimeLibraryPathSettings().then((settings) => {
      if (!alive || !settings) {
        return;
      }
      setIsDesktopRuntime(true);
      setPaths(settings);
    });
    return () => {
      alive = false;
    };
  }, [setIsDesktopRuntime, setPaths]);
}

export function useLibraryPathSettings() {
  const [paths, setPaths] = useState<RuntimeLibraryPaths>(() => createUnavailablePaths());
  const [errors, setErrors] = useState<LibraryPathErrorState>(() => createEmptyErrors());
  const [isDesktopRuntime, setIsDesktopRuntime] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<RuntimeLibraryPathLocation | null>(null);
  const mirrorRebuildState = useMirrorRebuildState();

  useInitialLibraryPathSettings(setIsDesktopRuntime, setPaths);

  async function handleChangeRequest(location: RuntimeLibraryPathLocation) {
    try {
      const selectedPath = await selectRuntimeImportDirectory();
      if (!selectedPath) {
        return;
      }
      await runLocationUpdate({
        getErrorMessage: getChangeErrorMessage,
        location,
        performUpdate: () => updateRuntimeLibraryPathSetting(location, selectedPath),
        resetMirrorRebuildState: mirrorRebuildState.resetMirrorRebuildState,
        setErrors,
        setPaths,
        setPendingLocation
      });
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [location]: formatLocationError(getChangeErrorMessage(location), error)
      }));
    }
  }

  async function handleRestoreDefault(location: RuntimeLibraryPathLocation) {
    await runLocationUpdate({
      getErrorMessage: getRestoreErrorMessage,
      location,
      performUpdate: () => updateRuntimeLibraryPathSetting(location, null),
      resetMirrorRebuildState: mirrorRebuildState.resetMirrorRebuildState,
      setErrors,
      setPaths,
      setPendingLocation
    });
  }

  return {
    assetsPath: paths.assetsDir,
    errorByLocation: errors,
    isDesktopRuntime,
    libraryHomePath: paths.libraryHome,
    mirrorPath: paths.mirror,
    pendingLocation,
    inboxPath: paths.inbox,
    onChangeLocation: handleChangeRequest,
    onRestoreDefault: handleRestoreDefault,
    ...mirrorRebuildState
  };
}
