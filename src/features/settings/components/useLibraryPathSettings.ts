import { useEffect, useState } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { selectRuntimeFolder } from '../../../shared/platform/folderSelectionRuntimeRepository';
import {
  EXISTING_LIBRARY_HOME_CONFIRMATION_ERROR,
  loadRuntimeLibraryPathSettings,
  updateRuntimeLibraryPathSetting,
  type RuntimeLibraryPathLocation,
  type RuntimeLibraryPaths
} from '../../../shared/platform/libraryPathsRuntimeRepository';

import {
  confirmExistingLibraryHome,
  createUnavailableLibraryPaths,
  formatLibraryPathLocationError,
  getLibraryPathChangeErrorMessage,
  getLibraryPathRestoreErrorMessage,
  type LibraryPathTranslate
} from './libraryPathSettingsCopy';
import { useMirrorRebuildState } from './useMirrorRebuildState';

type LibraryPathErrorState = Record<RuntimeLibraryPathLocation, string | null>;

const LIBRARY_HOME_SWITCH_CANCELLED_ERROR = 'library_home_switch_cancelled';

function createEmptyErrors(): LibraryPathErrorState {
  return {
    assets_dir: null,
    inbox: null,
    library_home: null,
    mirror: null
  };
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

function isExistingLibraryHomeConfirmationError(error: unknown) {
  return error instanceof Error && error.message.includes(EXISTING_LIBRARY_HOME_CONFIRMATION_ERROR);
}

function isLibraryHomeSwitchCancelledError(error: unknown) {
  return error instanceof Error && error.message.includes(LIBRARY_HOME_SWITCH_CANCELLED_ERROR);
}

async function updateSelectedRuntimeLibraryPath(location: RuntimeLibraryPathLocation, selectedPath: string, t: LibraryPathTranslate) {
  try {
    return await updateRuntimeLibraryPathSetting(location, selectedPath);
  } catch (error) {
    if (location !== 'library_home' || !isExistingLibraryHomeConfirmationError(error)) {
      throw error;
    }
    if (!(await confirmExistingLibraryHome(selectedPath, t))) {
      throw new Error(LIBRARY_HOME_SWITCH_CANCELLED_ERROR);
    }
    return updateRuntimeLibraryPathSetting(location, selectedPath, {
      confirmExistingLibraryHome: true
    });
  }
}

async function runLocationUpdate(args: {
  getErrorMessage: (location: RuntimeLibraryPathLocation) => string;
  location: RuntimeLibraryPathLocation;
  performUpdate: () => Promise<RuntimeLibraryPaths>;
  resetMirrorRebuildState: () => void;
  setErrors: (value: (current: LibraryPathErrorState) => LibraryPathErrorState) => void;
  setPaths: (value: RuntimeLibraryPaths) => void;
  setPendingLocation: (value: RuntimeLibraryPathLocation | null) => void;
  t: LibraryPathTranslate;
}) {
  args.setErrors((current) => clearLocationError(current, args.location));
  if (args.location === 'mirror') {
    args.resetMirrorRebuildState();
  }
  args.setPendingLocation(args.location);
  try {
    args.setPaths(await args.performUpdate());
  } catch (error) {
    if (isLibraryHomeSwitchCancelledError(error)) {
      return;
    }
    args.setErrors((current) => ({
      ...current,
      [args.location]: formatLibraryPathLocationError(args.getErrorMessage(args.location), error, args.t)
    }));
  } finally {
    args.setPendingLocation(null);
  }
}

function useInitialLibraryPathSettings(
  reloadKey: number,
  setIsDesktopRuntime: (value: boolean) => void,
  setIsLoading: (value: boolean) => void,
  setPaths: (value: RuntimeLibraryPaths) => void
) {
  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    loadRuntimeLibraryPathSettings()
      .then((settings) => {
        if (!alive || !settings) {
          return;
        }
        setIsDesktopRuntime(true);
        setPaths(settings);
      })
      .finally(() => {
        if (alive) {
          setIsLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [reloadKey, setIsDesktopRuntime, setIsLoading, setPaths]);
}

export function useLibraryPathSettings() {
  const t = useTranslation();
  const [paths, setPaths] = useState<RuntimeLibraryPaths>(() => createUnavailableLibraryPaths(t));
  const [errors, setErrors] = useState<LibraryPathErrorState>(() => createEmptyErrors());
  const [isLoading, setIsLoading] = useState(true);
  const [isDesktopRuntime, setIsDesktopRuntime] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<RuntimeLibraryPathLocation | null>(null);
  const [reloadKey] = useState(0);
  const mirrorRebuildState = useMirrorRebuildState();

  useInitialLibraryPathSettings(reloadKey, setIsDesktopRuntime, setIsLoading, setPaths);

  async function handleChangeRequest(location: RuntimeLibraryPathLocation) {
    try {
      const selectedPath = await selectRuntimeFolder();
      if (!selectedPath) {
        return;
      }
      await runLocationUpdate({
        getErrorMessage: (nextLocation) => getLibraryPathChangeErrorMessage(nextLocation, t),
        location,
        performUpdate: () => updateSelectedRuntimeLibraryPath(location, selectedPath, t),
        resetMirrorRebuildState: mirrorRebuildState.resetMirrorRebuildState,
        setErrors,
        setPaths,
        setPendingLocation,
        t
      });
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [location]: formatLibraryPathLocationError(getLibraryPathChangeErrorMessage(location, t), error, t)
      }));
    }
  }

  async function handleRestoreDefault(location: RuntimeLibraryPathLocation) {
    await runLocationUpdate({
      getErrorMessage: (nextLocation) => getLibraryPathRestoreErrorMessage(nextLocation, t),
      location,
      performUpdate: () => updateRuntimeLibraryPathSetting(location, null),
      resetMirrorRebuildState: mirrorRebuildState.resetMirrorRebuildState,
      setErrors,
      setPaths,
      setPendingLocation,
      t
    });
  }

  return {
    assetsPath: paths.assetsDir,
    errorByLocation: errors,
    isDesktopRuntime,
    isLoadingLibraryPaths: isLoading,
    libraryHomePath: paths.libraryHome,
    mirrorPath: paths.mirror,
    pendingLocation,
    inboxPath: paths.inbox,
    onChangeLocation: handleChangeRequest,
    onRestoreDefault: handleRestoreDefault,
    ...mirrorRebuildState
  };
}
