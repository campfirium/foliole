import { RotateCcw } from 'lucide-react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_RANGE_WIDTH_CLASS_NAME,
  SETTINGS_VALUE_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  settingsControlValueClassName,
  settingsRangeClassName,
  settingsResetButtonClassName
} from '../../../../shared/ui';
import {
  DEFAULT_READING_LINE_HEIGHT,
  READING_LINE_HEIGHT_MAX,
  READING_LINE_HEIGHT_MIN,
  READING_LINE_HEIGHT_STEP
} from '../../model/appearanceSettings';

export function ReadingLineHeightRow(props: {
  onReadingLineHeightChange: (value: number) => void;
  readingLineHeight: number;
}) {
  const t = useTranslation();

  return (
    <SettingsRow description={t('settings.appearance.lineHeight.description')} title={t('settings.appearance.lineHeight.title')}>
      <SettingsControlSlot className={SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-label={t('settings.appearance.lineHeight.reset')}
          className={settingsResetButtonClassName()}
          disabled={props.readingLineHeight === DEFAULT_READING_LINE_HEIGHT}
          onClick={() => props.onReadingLineHeightChange(DEFAULT_READING_LINE_HEIGHT)}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
        </button>
        <input
          aria-label={t('settings.appearance.lineHeight.title')}
          className={settingsRangeClassName(SETTINGS_RANGE_WIDTH_CLASS_NAME)}
          max={READING_LINE_HEIGHT_MAX}
          min={READING_LINE_HEIGHT_MIN}
          onChange={(event) => props.onReadingLineHeightChange(Number(event.target.value))}
          step={READING_LINE_HEIGHT_STEP}
          type="range"
          value={props.readingLineHeight}
        />
        <span className={settingsControlValueClassName(SETTINGS_VALUE_WIDTH_CLASS_NAME)}>
          {props.readingLineHeight.toFixed(2)}
        </span>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
