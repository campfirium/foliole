import { createContext, useContext } from 'react';

export interface ExternalFoldersSettingsContextValue {
  externalFoldersEnabled: boolean;
  setExternalFoldersEnabled: (value: boolean) => void;
}

export const ExternalFoldersSettingsContext = createContext<ExternalFoldersSettingsContextValue | null>(null);

export function useExternalFoldersSettings() {
  const context = useContext(ExternalFoldersSettingsContext);
  if (!context) {
    throw new Error('ExternalFoldersSettingsProvider is missing.');
  }
  return context;
}
