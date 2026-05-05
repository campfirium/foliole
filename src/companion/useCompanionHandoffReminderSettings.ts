import { useCallback, useState } from 'react';

import { saveCompanionSyncSettingRecord } from '../shared/platform/companionSyncObjects';

import {
  loadHandoffReminderSettings,
  saveHandoffReminderSettings,
  type CompanionHandoffReminderSettings
} from './companionHandoffReminderSettings';

export function useCompanionHandoffReminderSettings() {
  const [settings, setSettings] = useState(loadHandoffReminderSettings);

  const updateSettings = useCallback((nextSettings: CompanionHandoffReminderSettings) => {
    setSettings(nextSettings);
    saveHandoffReminderSettings(nextSettings);
    void saveCompanionSyncSettingRecord({
      key: 'handoff_reminder_settings',
      valueJson: JSON.stringify(nextSettings)
    });
  }, []);

  return { settings, updateSettings };
}
