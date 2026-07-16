import { RotateCcw } from 'lucide-react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_RANGE_WIDTH_CLASS_NAME,
  SETTINGS_VALUE_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsControlValueClassName,
  settingsRangeClassName,
  settingsResetButtonClassName
} from '../../../../shared/ui';
import { useDisplayScale } from '../../context/DisplayScaleProvider';
import {
  DEFAULT_APP_DISPLAY_SCALE_PERCENT,
  DISPLAY_SCALE_STEP,
  MAX_APP_DISPLAY_SCALE_PERCENT,
  MIN_APP_DISPLAY_SCALE_PERCENT
} from '../../model/displayScaleSettings';

export function SettingsDisplayScaleSection() {
  const t = useTranslation();
  const displayScale = useDisplayScale();
  return (
    <SettingsSection ariaLabel={t('settings.appearance.displayScale.aria')} title={t('settings.appearance.displayScale.section')}>
      <SettingsRow
        description={t('settings.appearance.displayScale.description')}
        title={t('settings.appearance.displayScale.title')}
      >
        <SettingsControlSlot className={SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME}>
          <button
            aria-label={t('settings.appearance.displayScale.reset')}
            className={settingsResetButtonClassName()}
            disabled={displayScale.appDisplayScalePercent === DEFAULT_APP_DISPLAY_SCALE_PERCENT}
            onClick={() => displayScale.setAppDisplayScalePercent(DEFAULT_APP_DISPLAY_SCALE_PERCENT)}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={18} />
          </button>
          <input
            aria-label={t('settings.appearance.displayScale.sliderAria')}
            className={settingsRangeClassName(SETTINGS_RANGE_WIDTH_CLASS_NAME)}
            max={MAX_APP_DISPLAY_SCALE_PERCENT}
            min={MIN_APP_DISPLAY_SCALE_PERCENT}
            onChange={(event) => displayScale.setAppDisplayScalePercent(Number(event.target.value))}
            step={DISPLAY_SCALE_STEP}
            type="range"
            value={displayScale.appDisplayScalePercent}
          />
          <span className={settingsControlValueClassName(SETTINGS_VALUE_WIDTH_CLASS_NAME)}>
            {displayScale.appDisplayScalePercent}%
          </span>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
