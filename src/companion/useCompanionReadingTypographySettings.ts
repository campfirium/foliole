import { useCallback, useEffect, useState } from 'react';

import { activateReadingFont } from './companionReadingFonts';
import {
  type CompanionReadingTypographySettings,
  loadReadingTypographySettings,
  saveReadingTypographySettings
} from './companionReadingTypographySettings';

export function useCompanionReadingTypographySettings() {
  const [settings, setSettings] = useState(loadReadingTypographySettings);

  useEffect(() => {
    if (!settings.fontFamily.startsWith('custom:')) return;
    let active = true;
    void activateReadingFont(settings.fontFamily.slice(7)).then((found) => {
      if (active && !found) {
        setSettings((current) => {
          const next = { ...current, fontFamily: 'sans' as const };
          saveReadingTypographySettings(next);
          return next;
        });
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [settings.fontFamily]);

  const updateSettings = useCallback((nextSettings: CompanionReadingTypographySettings) => {
    setSettings(nextSettings);
    saveReadingTypographySettings(nextSettings);
  }, []);

  return { settings, updateSettings };
}
