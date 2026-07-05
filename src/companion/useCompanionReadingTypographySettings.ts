import { useCallback, useState } from 'react';

import {
  type CompanionReadingTypographySettings,
  loadReadingTypographySettings,
  saveReadingTypographySettings
} from './companionReadingTypographySettings';

export function useCompanionReadingTypographySettings() {
  const [settings, setSettings] = useState(loadReadingTypographySettings);

  const updateSettings = useCallback((nextSettings: CompanionReadingTypographySettings) => {
    setSettings(nextSettings);
    saveReadingTypographySettings(nextSettings);
  }, []);

  return { settings, updateSettings };
}
