import { useState } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../../shared/platform/storage';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { settingsSearchRowProps } from '../../model/settingsSearch';

const GLOBAL_CLIP_FALLBACK_KEY = APP_SETTINGS_STORAGE_KEYS.globalClipExistingClipboardFallbackEnabled;

function isGlobalClipFallbackEnabled() {
  return getWhitelistedLocalStorageItem(GLOBAL_CLIP_FALLBACK_KEY) !== 'false';
}

export function SettingsGlobalClipSection() {
  const t = useTranslation();
  const [enabled, setEnabled] = useState(isGlobalClipFallbackEnabled);
  const updateEnabled = (nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    setWhitelistedLocalStorageItem(GLOBAL_CLIP_FALLBACK_KEY, nextEnabled ? 'true' : 'false');
  };

  return (
    <SettingsSection ariaLabel={t('settings.globalClip.sectionAria')} title={t('settings.globalClip.title')}>
      <SettingsRow
        {...settingsSearchRowProps({
          categoryId: 'general',
          description: t('settings.globalClip.clipboardFallback.description'),
          id: 'general-global-clip-clipboard-fallback',
          title: t('settings.globalClip.clipboardFallback.title')
        })}
        description={t('settings.globalClip.clipboardFallback.description')}
        title={t('settings.globalClip.clipboardFallback.title')}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button
            aria-checked={enabled}
            aria-label={t('settings.globalClip.clipboardFallback.aria')}
            className={settingsSwitchClassName(enabled)}
            onClick={() => updateEnabled(!enabled)}
            role="switch"
            type="button"
          >
            <span aria-hidden="true" className={settingsSwitchKnobClassName(enabled)} />
          </button>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
