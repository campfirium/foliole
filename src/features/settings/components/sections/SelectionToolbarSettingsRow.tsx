import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_RANGE_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  settingsControlValueClassName,
  settingsRangeClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';

export function SelectionToolbarSettingsRow() {
  const t = useTranslation();
  const {
    selectionToolbarEnabled,
    selectionToolbarOpacityPercent,
    setSelectionToolbarEnabled,
    setSelectionToolbarOpacityPercent
  } = useAppearanceSettings();

  return (
    <SettingsRow
      description={t('settings.appearance.floatingToolbar.description')}
      title={t('settings.appearance.floatingToolbar.title')}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <input
          aria-label={t('settings.appearance.floatingToolbar.opacity')}
          className={settingsRangeClassName(SETTINGS_RANGE_WIDTH_CLASS_NAME)}
          max={100}
          min={0}
          onChange={(event) => setSelectionToolbarOpacityPercent(Number(event.target.value))}
          step={1}
          type="range"
          value={selectionToolbarOpacityPercent}
        />
        <span className={settingsControlValueClassName('w-12 tabular-nums')}>
          {selectionToolbarOpacityPercent}%
        </span>
        <button
          aria-checked={selectionToolbarEnabled}
          aria-label={t('settings.appearance.floatingToolbar.show')}
          className={settingsSwitchClassName(selectionToolbarEnabled)}
          onClick={() => setSelectionToolbarEnabled(!selectionToolbarEnabled)}
          role="switch"
          type="button"
        >
          <span
            aria-hidden="true"
            className={settingsSwitchKnobClassName(selectionToolbarEnabled)}
          />
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
