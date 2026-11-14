import { useState } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  getWhitelistedLocalStorageItem,
  saveWhitelistedLocalStorageItem
} from '../../../../shared/platform/storage';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { QUIT_ON_CLOSE_SEARCH_ROW_ID } from '../../model/quitOnCloseAvailability';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

const key = APP_SETTINGS_STORAGE_KEYS.quitOnWindowClose;

export function SettingsQuitOnCloseRow() {
  const t = useTranslation();
  const row = useLocalizedSettingsSearchRow(QUIT_ON_CLOSE_SEARCH_ROW_ID);
  const [enabled, setEnabled] = useState(() => getWhitelistedLocalStorageItem(key) === 'true');
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const update = async () => {
    setSaving(true);
    const saved = await saveWhitelistedLocalStorageItem(key, String(!enabled));
    if (saved) setEnabled(!enabled);
    else window.localStorage.setItem(key, String(enabled));
    setSaveFailed(!saved);
    setSaving(false);
  };

  return (
    <SettingsRow
      description={saveFailed ? t('settings.general.quitOnClose.saveFailed') : row.description}
      {...settingsSearchRowProps(row)}
      title={row.title}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-checked={enabled}
          aria-label={row.title}
          className={settingsSwitchClassName(enabled)}
          disabled={saving}
          onClick={() => void update()}
          role="switch"
          type="button"
        >
          <span aria-hidden="true" className={settingsSwitchKnobClassName(enabled)} />
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
