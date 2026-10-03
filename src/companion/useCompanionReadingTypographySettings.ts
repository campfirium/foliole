import { useCallback, useEffect, useState } from 'react';

import { activateReadingFont } from './companionReadingFonts';
import {
  type CompanionReadingTypographySettings,
  loadReadingTypographySettings,
  normalizeReadingTypographySettings,
  saveReadingTypographySettings
} from './companionReadingTypographySettings';

export function useCompanionReadingTypographySettings() {
  const [settings, setSettings] = useState(loadReadingTypographySettings);
  const [saveError, setSaveError] = useState(false);
  const updateSettings = useCallback((nextSettings: CompanionReadingTypographySettings) => {
    const next = normalizeReadingTypographySettings(nextSettings);
    if (!saveReadingTypographySettings(next)) {
      setSaveError(true);
      return;
    }
    setSettings(next);
    setSaveError(false);
  }, []);

  useEffect(() => {
    if (!settings.fontFamily.startsWith('custom:')) return;
    let active = true;
    void activateReadingFont(settings.fontFamily.slice(7)).then((found) => {
      if (active && !found) {
        updateSettings({ ...settings, fontFamily: 'sans' });
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [settings, updateSettings]);

  return { settings, updateSettings, saveError };
}
