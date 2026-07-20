import { useCallback, useEffect, useRef, useState } from 'react';

import {
  loadCompanionSyncSettingValueJson,
  saveCompanionSyncSettingRecord
} from '../shared/platform/companionSyncObjects';

import {
  loadHandoffReminderSettings,
  parseHandoffReminderSettings,
  saveHandoffReminderSettings,
  type CompanionHandoffReminderSettings
} from './companionHandoffReminderSettings';

export function useCompanionHandoffReminderSettings() {
  const [settings, setSettings] = useState(loadHandoffReminderSettings);
  const didUpdate = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadCompanionSyncSettingValueJson('handoff_reminder_settings').then((valueJson) => {
      const hydrated = valueJson ? parseHandoffReminderSettings(valueJson) : null;
      if (cancelled || didUpdate.current || !hydrated) return;
      saveHandoffReminderSettings(hydrated);
      setSettings(hydrated);
    }).catch(() => null);
    return () => { cancelled = true; };
  }, []);

  const updateSettings = useCallback((nextSettings: CompanionHandoffReminderSettings) => {
    didUpdate.current = true;
    setSettings(nextSettings);
    saveHandoffReminderSettings(nextSettings);
    void saveCompanionSyncSettingRecord({
      key: 'handoff_reminder_settings',
      valueJson: JSON.stringify(nextSettings)
    });
  }, []);

  return { settings, updateSettings };
}
