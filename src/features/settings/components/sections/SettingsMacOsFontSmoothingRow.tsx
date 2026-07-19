import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  applyMacOsFontSmoothing,
  getMacOsFontSmoothingEnabled,
  setMacOsFontSmoothingEnabled,
  supportsMacOsFontSmoothingSetting
} from '../../../../shared/platform/macOsFontSmoothing';
import {
  SettingsControlSlot,
  SettingsRow,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';

export function SettingsMacOsFontSmoothingRow() {
  const t = useTranslation();
  const supported = supportsMacOsFontSmoothingSetting();
  const [enabled, setEnabled] = useState(getMacOsFontSmoothingEnabled);

  useEffect(() => {
    applyMacOsFontSmoothing(enabled);
  }, [enabled]);

  if (!supported) return null;

  const title = t('settings.appearance.fontSmoothing.title');
  return (
    <SettingsRow description={t('settings.appearance.fontSmoothing.description')} title={title}>
      <SettingsControlSlot>
        <button
          aria-checked={enabled}
          aria-label={title}
          className={settingsSwitchClassName(enabled)}
          onClick={() => {
            const nextEnabled = !enabled;
            setEnabled(nextEnabled);
            setMacOsFontSmoothingEnabled(nextEnabled);
          }}
          role="switch"
          type="button"
        >
          <span className={settingsSwitchKnobClassName(enabled)} />
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
