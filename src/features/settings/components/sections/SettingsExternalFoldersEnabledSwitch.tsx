import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { useExternalFoldersSettings } from '../../context/ExternalFoldersSettingsProvider';

export function SettingsExternalFoldersEnabledSwitch() {
  const t = useTranslation();
  const { externalFoldersEnabled, setExternalFoldersEnabled } = useExternalFoldersSettings();

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-foreground/70">{t('settings.externalSources.enabledLabel')}</span>
      <button
        aria-checked={externalFoldersEnabled}
        aria-label={t('settings.externalSources.enabledAria')}
        className={settingsSwitchClassName(externalFoldersEnabled)}
        onClick={() => setExternalFoldersEnabled(!externalFoldersEnabled)}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" className={settingsSwitchKnobClassName(externalFoldersEnabled)} />
      </button>
    </div>
  );
}
