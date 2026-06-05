import { useCallback, useMemo, useState, type ReactNode } from 'react';

import {
  getExternalFoldersEnabled,
  setExternalFoldersEnabled as saveExternalFoldersEnabled
} from '../model/externalFoldersSettings';

import {
  ExternalFoldersSettingsContext,
  useExternalFoldersSettings
} from './externalFoldersSettingsContext';

function useExternalFoldersSettingsState() {
  const [externalFoldersEnabled, setExternalFoldersEnabledState] = useState(() => getExternalFoldersEnabled());
  const setExternalFoldersEnabled = useCallback((value: boolean) => {
    setExternalFoldersEnabledState(value);
    saveExternalFoldersEnabled(value);
  }, []);

  return useMemo(
    () => ({
      externalFoldersEnabled,
      setExternalFoldersEnabled
    }),
    [externalFoldersEnabled, setExternalFoldersEnabled]
  );
}

export function ExternalFoldersSettingsProvider({ children }: { children: ReactNode }) {
  const value = useExternalFoldersSettingsState();
  return <ExternalFoldersSettingsContext.Provider value={value}>{children}</ExternalFoldersSettingsContext.Provider>;
}

export { useExternalFoldersSettings };
