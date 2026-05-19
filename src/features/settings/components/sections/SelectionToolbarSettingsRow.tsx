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
  const {
    selectionToolbarEnabled,
    selectionToolbarOpacityPercent,
    setSelectionToolbarEnabled,
    setSelectionToolbarOpacityPercent
  } = useAppearanceSettings();

  return (
    <SettingsRow
      description="Adjust the floating toolbar shown for text selections and existing highlights."
      title="Floating toolbar"
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <input
          aria-label="Floating toolbar opacity"
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
          aria-label="Show floating toolbar"
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
