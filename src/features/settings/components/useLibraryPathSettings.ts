import { useEffect, useState } from 'react';

import { selectRuntimeImportDirectory } from '../../../shared/platform/importBridge';
import {
  loadRuntimeLibraryPathSettings,
  updateRuntimeLibraryPathSetting,
  type RuntimeLibraryPathLocation,
  type RuntimeLibraryPaths
} from '../../../shared/platform/libraryPathsBridge';

type LibraryPathErrorState = Record<RuntimeLibraryPathLocation, string | null>;

function createEmptyErrors(): LibraryPathErrorState {
  return {
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
  if (location === 'mirror') {
    return 'Could not choose a new Mirror folder.';
  }
  return 'Could not choose a new Inbox folder.';
}

function getRestoreErrorMessage(location: RuntimeLibraryPathLocation) {
  if (location === 'library_home') {
    return 'Could not restore the default Library Home folder.';
  }
  if (location === 'mirror') {
    return 'Could not restore the default Mirror folder.';
  }
  return 'Could not restore the default Inbox folder.';
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

  useInitialLibraryPathSettings(setIsDesktopRuntime, setPaths);

  async function handleChangeRequest(location: RuntimeLibraryPathLocation) {
    setErrors((current) => clearLocationError(current, location));
    setPendingLocation(location);
    try {
      const selectedPath = await selectRuntimeImportDirectory();
      if (!selectedPath) {
        return;
      }
      setPaths(await updateRuntimeLibraryPathSetting(location, selectedPath));
    } catch {
      setErrors((current) => ({
        ...current,
        [location]: getChangeErrorMessage(location)
      }));
    } finally {
      setPendingLocation(null);
    }
  }

  async function handleRestoreDefault(location: RuntimeLibraryPathLocation) {
    setErrors((current) => clearLocationError(current, location));
    setPendingLocation(location);
    try {
      setPaths(await updateRuntimeLibraryPathSetting(location, null));
    } catch {
      setErrors((current) => ({
        ...current,
        [location]: getRestoreErrorMessage(location)
      }));
    } finally {
      setPendingLocation(null);
    }
  }

  return {
    errorByLocation: errors,
    isDesktopRuntime,
    libraryHomePath: paths.libraryHome,
    mirrorPath: paths.mirror,
    pendingLocation,
    inboxPath: paths.inbox,
    onChangeLocation: handleChangeRequest,
    onRestoreDefault: handleRestoreDefault
  };
}
