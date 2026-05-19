import { useEffect } from 'react';

import { loadRuntimeLibraryPathSettings } from '../../../../shared/platform/libraryPathsRuntimeRepository';
import type { RuntimeSourceDispositionSummary } from '../../../../shared/platform/settingsRuntimeRepository';
import {
  listDatabaseBackups,
  loadSourceDispositionSummary,
  type DatabaseBackupEntry
} from '../../model/databaseBackups';
import {
  loadDatabaseBackupSettings,
  type DatabaseBackupSettings
} from '../../model/databaseBackupSettings';

export function useInitialBackupData(
  isDesktopRuntime: boolean,
  reloadKey: number,
  setBackups: (value: DatabaseBackupEntry[]) => void,
  setSourceDispositionSummary: (value: RuntimeSourceDispositionSummary) => void,
  setDraft: (value: DatabaseBackupSettings) => void,
  setIsLoadingBackups: (value: boolean) => void,
  setLoadErrorMessage: (value: string) => void,
  setSettings: (value: DatabaseBackupSettings) => void
) {
  useEffect(() => {
    let alive = true;
    setLoadErrorMessage('');
    setIsLoadingBackups(true);
    void loadDatabaseBackupSettings()
      .then((value) => {
        if (!alive) return;
        setSettings(value);
        setDraft(value);
      })
      .catch(() => {
        if (!alive) return;
        setLoadErrorMessage('Could not load backup settings.');
        setIsLoadingBackups(false);
      });
    if (!isDesktopRuntime) {
      setBackups([]);
      setSourceDispositionSummary({ recordCount: 0, sizeBytes: 0 });
      setIsLoadingBackups(false);
    } else {
      void listDatabaseBackups().then((entries) => {
        if (!alive) return;
        setBackups(entries);
      }).finally(() => {
        if (alive) setIsLoadingBackups(false);
      });
      void loadSourceDispositionSummary().then((summary) => {
        if (alive) setSourceDispositionSummary(summary);
      });
    }
    return () => {
      alive = false;
    };
  }, [isDesktopRuntime, reloadKey, setBackups, setDraft, setIsLoadingBackups, setLoadErrorMessage, setSettings, setSourceDispositionSummary]);
}

function joinBackupPath(libraryHome: string) {
  const separator = libraryHome.includes('\\') ? '\\' : '/';
  return `${libraryHome.replace(/[\\/]+$/, '')}${separator}Backups`;
}

export function useDefaultBackupPath(
  isDesktopRuntime: boolean,
  setDefaultBackupPath: (value: string) => void
) {
  useEffect(() => {
    let alive = true;
    if (!isDesktopRuntime) return undefined;
    void loadRuntimeLibraryPathSettings().then((paths) => {
      if (!alive || !paths) return;
      setDefaultBackupPath(joinBackupPath(paths.libraryHome));
    });
    return () => {
      alive = false;
    };
  }, [isDesktopRuntime, setDefaultBackupPath]);
}
