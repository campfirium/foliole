import { useState } from 'react';

import type { SettingsCategoryId } from '../../features/settings/model/settingsPanelOptions';
import type { SettingsSearchRowId } from '../../features/settings/model/settingsSearch';

export function useSettingsRequestState() {
  const [requestedSettingsCategory, setRequestedSettingsCategory] = useState<SettingsCategoryId | null>(null);
  const [requestedSettingsDialog, setRequestedSettingsDialog] = useState<'readwise-reader' | null>(null);
  const [requestedSettingsRowId, setRequestedSettingsRowId] = useState<SettingsSearchRowId | null>(null);
  return {
    requestedSettingsCategory,
    requestedSettingsDialog,
    requestedSettingsRowId,
    setRequestedSettingsCategory,
    setRequestedSettingsDialog,
    setRequestedSettingsRowId
  };
}
