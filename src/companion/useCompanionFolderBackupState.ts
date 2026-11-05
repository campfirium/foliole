import { useEffect, useState } from 'react';

import type { CompanionFolderBackupState } from '../../lib/platform/companionFolderBackupContract';
import { getCompanionAutomaticFolderBackup, subscribeCompanionAutomaticFolderBackup } from '../shared/platform/companion/folderBackup/companionAutomaticFolderBackup';
import { getCompanionFolderBackupPort } from '../shared/platform/companion/folderBackup/companionFolderBackupRuntimeRepository';
import { getCompanionFolderBackupState, subscribeCompanionFolderBackupWork } from '../shared/platform/companion/folderBackup/companionFolderBackupState';
import { getCompanionSettingsPreview } from '../shared/platform/companionSettingsPreview';

export function useCompanionFolderBackupState(supported: boolean) {
  const [state, setState] = useState<CompanionFolderBackupState | null>(null);
  const [automatic, setAutomatic] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const preview = getCompanionSettingsPreview();
    if (preview) {
      const refresh = () => { const value = preview.snapshot(); setState(value.backup); setAutomatic(value.automaticBackup); setError(value.backup.errorMessage); };
      refresh();
      return preview.subscribe(refresh);
    }
    if (!supported) return;
    let active = true;
    let receivedEvents = 0;
    let automaticRevision = 0;
    const automaticSubscription = subscribeCompanionAutomaticFolderBackup(value => { automaticRevision++; if (active) setAutomatic(value); });
    void getCompanionAutomaticFolderBackup().then(value => { if (active && automaticRevision === 0) setAutomatic(value); })
      .catch((failure: unknown) => { if (active) setError(String(failure)); });
    const port = getCompanionFolderBackupPort();
    const refresh = (value?: CompanionFolderBackupState) => {
      const revision = ++receivedEvents;
      void getCompanionFolderBackupState(value).then(next => {
        if (active && receivedEvents === revision) { setState(next); setError(next.errorMessage); }
      }).catch((failure: unknown) => { if (active) setError(String(failure)); });
    };
    const workSubscription = subscribeCompanionFolderBackupWork(() => refresh());
    const subscription = port.addListener('backupStateChanged', ({ state: value }) => {
      if (active) { setState(previous => ({ ...value, pendingItems: previous?.directoryId === value.directoryId ? previous?.pendingItems ?? null : null })); setError(value.errorMessage); refresh(value); }
    });
    void subscription.then(() => refresh()).catch((failure: unknown) => { if (active) setError(String(failure)); });
    return () => {
      active = false;
      automaticSubscription();
      workSubscription();
      void subscription.then((listener) => listener.remove()).catch(() => undefined);
    };
  }, [supported]);

  return { state, setState, error, setError, automatic, setAutomatic };
}
