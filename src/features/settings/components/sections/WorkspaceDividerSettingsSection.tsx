import {
  SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_RANGE_WIDTH_CLASS_NAME,
  SETTINGS_VALUE_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsControlValueClassName,
  settingsRangeClassName
} from '../../../../shared/ui';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';
import {
  WORKSPACE_DIVIDER_OPACITY_PERCENT_MAX,
  WORKSPACE_DIVIDER_OPACITY_PERCENT_MIN,
  WORKSPACE_DIVIDER_OPACITY_PERCENT_STEP
} from '../../model/appearanceSettings';

export function WorkspaceDividerSettingsSection() {
  const {
    setWorkspaceDividerOpacityPercent,
    workspaceDividerOpacityPercent
  } = useAppearanceSettings();

  return (
    <SettingsSection ariaLabel="Workspace divider settings" title="Dividers">
      <SettingsRow
        description="Set how strongly workspace separators appear."
        title="Divider opacity"
      >
        <SettingsControlSlot className={SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME}>
          <input
            aria-label="Workspace divider opacity"
            className={settingsRangeClassName(SETTINGS_RANGE_WIDTH_CLASS_NAME)}
            max={WORKSPACE_DIVIDER_OPACITY_PERCENT_MAX}
            min={WORKSPACE_DIVIDER_OPACITY_PERCENT_MIN}
            onChange={(event) => setWorkspaceDividerOpacityPercent(Number(event.target.value))}
            step={WORKSPACE_DIVIDER_OPACITY_PERCENT_STEP}
            type="range"
            value={workspaceDividerOpacityPercent}
          />
          <span className={settingsControlValueClassName(SETTINGS_VALUE_WIDTH_CLASS_NAME)}>
            {workspaceDividerOpacityPercent}%
          </span>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
