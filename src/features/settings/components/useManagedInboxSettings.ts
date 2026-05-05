import { useEffect, useState } from 'react';

import { MANAGED_INBOX_DEFAULT_DIRNAME } from '../../../../lib/platform/managedInbox';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { resolveRuntimeAppPaths } from '../../../shared/platform/bridge';
import { selectRuntimeImportDirectory } from '../../../shared/platform/importBridge';
import { removeWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

function readStoredManagedInboxPath() {
  if (typeof window === 'undefined') {
    return null;
  }
  const value = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.managedInboxPath);
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function joinDisplayPath(basePath: string, childName: string) {
  const separator = basePath.includes('\\') && !basePath.includes('/') ? '\\' : '/';
  return `${basePath.replace(/[\\/]+$/, '')}${separator}${childName}`;
}

export function useManagedInboxSettings() {
  const [defaultInboxPath, setDefaultInboxPath] = useState('');
  const [inboxPath, setInboxPath] = useState(() => readStoredManagedInboxPath() ?? '');
  const [isInboxDesktopRuntime, setIsInboxDesktopRuntime] = useState(false);
  const [isInboxPathPending, setIsInboxPathPending] = useState(false);
  const [inboxPathError, setInboxPathError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    resolveRuntimeAppPaths().then((appPaths) => {
      if (!alive || !appPaths) {
        return;
      }
      const resolvedDefaultPath = joinDisplayPath(appPaths.appDataDir, MANAGED_INBOX_DEFAULT_DIRNAME);
      setIsInboxDesktopRuntime(true);
      setDefaultInboxPath(resolvedDefaultPath);
      setInboxPath((current) => current || readStoredManagedInboxPath() || resolvedDefaultPath);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function handleInboxPathChangeRequest() {
    setInboxPathError(null);
    setIsInboxPathPending(true);
    try {
      const selectedPath = await selectRuntimeImportDirectory();
      if (selectedPath) {
        setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.managedInboxPath, selectedPath);
        setInboxPath(selectedPath);
      }
    } catch {
      setInboxPathError('Could not choose a new Inbox folder.');
    } finally {
      setIsInboxPathPending(false);
    }
  }

  function handleInboxPathRestoreDefault() {
    if (!defaultInboxPath) {
      return;
    }
    setInboxPathError(null);
    setIsInboxPathPending(true);
    try {
      removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.managedInboxPath);
      setInboxPath(defaultInboxPath);
    } catch {
      setInboxPathError('Could not restore the default Inbox folder.');
    } finally {
      setIsInboxPathPending(false);
    }
  }

  return {
    inboxPath: inboxPath || defaultInboxPath || 'Unavailable',
    inboxPathError,
    isInboxDesktopRuntime,
    isInboxPathPending,
    onInboxPathChangeRequest: handleInboxPathChangeRequest,
    onInboxPathRestoreDefault: handleInboxPathRestoreDefault
  };
}
