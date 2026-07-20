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

export function useCompanionHandoffReminderSettings(refreshKey?: string | null) {
  const [settings, setSettings] = useState(loadHandoffReminderSettings);
  const updateRevision = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const hydrationRevision = updateRevision.current;
    void loadCompanionSyncSettingValueJson('handoff_reminder_settings').then((valueJson) => {
      const hydrated = valueJson ? parseHandoffReminderSettings(valueJson) : null;
      if (cancelled || updateRevision.current !== hydrationRevision || !hydrated) return;
      saveHandoffReminderSettings(hydrated);
      setSettings(hydrated);
    }).catch(() => null);
    return () => { cancelled = true; };
  }, [refreshKey]);

  const updateSettings = useCallback((nextSettings: CompanionHandoffReminderSettings) => {
    updateRevision.current += 1;
    setSettings(nextSettings);
    saveHandoffReminderSettings(nextSettings);
    void saveCompanionSyncSettingRecord({
      key: 'handoff_reminder_settings',
      valueJson: JSON.stringify(nextSettings)
    });
  }, []);

  return { settings, updateSettings };
}
