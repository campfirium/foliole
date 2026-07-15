import { useEffect, useState } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  loadDesktopHostCapabilities,
  type DesktopHostCapabilities
} from '../../../../shared/platform/desktopHostCapabilities';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../../shared/platform/storage';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_SELECT_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsFieldClassName
} from '../../../../shared/ui';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

type CaptureToastPosition = 'bottom-right' | 'top-right';

function loadToastPosition(): CaptureToastPosition {
  return getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.globalClipToastPosition) === 'bottom-right'
    ? 'bottom-right'
    : 'top-right';
}

function permissionDescription(capabilities: DesktopHostCapabilities | null, t: ReturnType<typeof useTranslation>) {
  if (capabilities?.globalCaptureSupported === false) return t('settings.capture.permission.unsupported');
  if (capabilities?.globalCapturePermission === 'granted') return t('settings.capture.permission.granted');
  if (capabilities?.globalCapturePermission === 'denied') return t('settings.capture.permission.denied');
  if (capabilities?.globalCapturePermission === 'unavailable') return t('settings.capture.permission.unavailable');
  return t('settings.capture.permission.notRequired');
}

export function SettingsCaptureSection() {
  const t = useTranslation();
  const positionRow = useLocalizedSettingsSearchRow('capture-confirmation-position');
  const [capabilities, setCapabilities] = useState<DesktopHostCapabilities | null>(null);
  const [position, setPosition] = useState<CaptureToastPosition>(loadToastPosition);

  useEffect(() => {
    let active = true;
    void loadDesktopHostCapabilities().then((value) => {
      if (active) setCapabilities(value);
    });
    return () => { active = false; };
  }, []);

  const updatePosition = (value: string) => {
    const nextPosition = value === 'bottom-right' ? 'bottom-right' : 'top-right';
    setPosition(nextPosition);
    setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.globalClipToastPosition, nextPosition);
  };

  return (
    <SettingsSection ariaLabel={t('settings.capture.sectionAria')} title={t('settings.capture.sectionTitle')}>
      <SettingsRow
        description={permissionDescription(capabilities, t)}
        readonly
        title={t('settings.capture.permission.title')}
      />
      {capabilities?.globalCaptureToastPositionSupported ? (
        <SettingsRow
          description={positionRow.description}
          {...settingsSearchRowProps(positionRow)}
          title={positionRow.title}
        >
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <select
              aria-label={positionRow.title}
              className={settingsFieldClassName(SETTINGS_SELECT_WIDTH_CLASS_NAME)}
              onChange={(event) => updatePosition(event.target.value)}
              value={position}
            >
              <option value="top-right">{t('settings.capture.position.topRight')}</option>
              <option value="bottom-right">{t('settings.capture.position.bottomRight')}</option>
            </select>
          </SettingsControlSlot>
        </SettingsRow>
      ) : null}
    </SettingsSection>
  );
}
