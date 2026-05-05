import { useEffect, useState } from 'react';

import { selectRuntimeImportDirectory } from '../../../shared/platform/importBridge';
import {
  loadRuntimeLibraryPathSettings,
  rebuildRuntimeMirrorAttachmentLinks,
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

function clearMirrorRebuildState(
  setMirrorLinkRebuildFeedback: (value: string | null) => void,
  setMirrorLinkRebuildError: (value: string | null) => void
) {
  setMirrorLinkRebuildFeedback(null);
  setMirrorLinkRebuildError(null);
}

function toMirrorRebuildFeedback(scannedDocumentCount: number, rewrittenDocumentCount: number, rewrittenLinkCount: number) {
  if (rewrittenLinkCount > 0) {
    return `Rebuilt ${rewrittenLinkCount} mirror attachment links across ${rewrittenDocumentCount} documents.`;
  }
  return `Mirror attachment links are already up to date across ${scannedDocumentCount} documents.`;
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
  } catch {
    args.setErrors((current) => ({
      ...current,
      [args.location]: args.getErrorMessage(args.location)
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

function useMirrorLinkRebuildState() {
  const [isRebuildingMirrorLinks, setIsRebuildingMirrorLinks] = useState(false);
  const [mirrorLinkRebuildFeedback, setMirrorLinkRebuildFeedback] = useState<string | null>(null);
  const [mirrorLinkRebuildError, setMirrorLinkRebuildError] = useState<string | null>(null);

  function resetMirrorRebuildState() {
    clearMirrorRebuildState(setMirrorLinkRebuildFeedback, setMirrorLinkRebuildError);
  }

  async function rebuildMirrorLinks() {
    resetMirrorRebuildState();
    setIsRebuildingMirrorLinks(true);
    try {
      const result = await rebuildRuntimeMirrorAttachmentLinks();
      setMirrorLinkRebuildFeedback(
        toMirrorRebuildFeedback(result.scannedDocumentCount, result.rewrittenDocumentCount, result.rewrittenLinkCount)
      );
    } catch {
      setMirrorLinkRebuildError('Could not rebuild mirror attachment links.');
    } finally {
      setIsRebuildingMirrorLinks(false);
    }
  }

  return {
    isRebuildingMirrorLinks,
    mirrorLinkRebuildError,
    mirrorLinkRebuildFeedback,
    onRebuildMirrorLinks: rebuildMirrorLinks,
    resetMirrorRebuildState
  };
}

export function useLibraryPathSettings() {
  const [paths, setPaths] = useState<RuntimeLibraryPaths>(() => createUnavailablePaths());
  const [errors, setErrors] = useState<LibraryPathErrorState>(() => createEmptyErrors());
  const [isDesktopRuntime, setIsDesktopRuntime] = useState(false);
  const [pendingLocation, setPendingLocation] = useState<RuntimeLibraryPathLocation | null>(null);
  const mirrorLinkRebuildState = useMirrorLinkRebuildState();

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
        resetMirrorRebuildState: mirrorLinkRebuildState.resetMirrorRebuildState,
        setErrors,
        setPaths,
        setPendingLocation
      });
    } catch {
      setErrors((current) => ({
        ...current,
        [location]: getChangeErrorMessage(location)
      }));
    }
  }

  async function handleRestoreDefault(location: RuntimeLibraryPathLocation) {
    await runLocationUpdate({
      getErrorMessage: getRestoreErrorMessage,
      location,
      performUpdate: () => updateRuntimeLibraryPathSetting(location, null),
      resetMirrorRebuildState: mirrorLinkRebuildState.resetMirrorRebuildState,
      setErrors,
      setPaths,
      setPendingLocation
    });
  }

  return {
    errorByLocation: errors,
    isDesktopRuntime,
    libraryHomePath: paths.libraryHome,
    mirrorPath: paths.mirror,
    pendingLocation,
    inboxPath: paths.inbox,
    onChangeLocation: handleChangeRequest,
    onRestoreDefault: handleRestoreDefault,
    ...mirrorLinkRebuildState
  };
}
