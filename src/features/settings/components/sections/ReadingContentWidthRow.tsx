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
  READING_CONTENT_WIDTH_DEFAULT,
  READING_CONTENT_WIDTH_MAX,
  READING_CONTENT_WIDTH_MIN,
  READING_CONTENT_WIDTH_STEP
} from '../../model/appearanceSettings';

export function ReadingContentWidthRow(props: {
  onReadingContentWidthChange: (value: number) => void;
  readingContentWidth: number;
}) {
  const t = useTranslation();

  return (
    <SettingsRow description={t('settings.appearance.readingWidth.description')} title={t('settings.appearance.readingWidth.title')}>
      <SettingsControlSlot className={SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-label={t('settings.appearance.readingWidth.reset')}
          className={settingsResetButtonClassName()}
          disabled={props.readingContentWidth === READING_CONTENT_WIDTH_DEFAULT}
          onClick={() => props.onReadingContentWidthChange(READING_CONTENT_WIDTH_DEFAULT)}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
        </button>
        <input
          aria-label={t('settings.appearance.readingWidth.title')}
          className={settingsRangeClassName(SETTINGS_RANGE_WIDTH_CLASS_NAME)}
          max={READING_CONTENT_WIDTH_MAX}
          min={READING_CONTENT_WIDTH_MIN}
          onChange={(event) => props.onReadingContentWidthChange(Number(event.target.value))}
          step={READING_CONTENT_WIDTH_STEP}
          type="range"
          value={props.readingContentWidth}
        />
        <span className={settingsControlValueClassName(SETTINGS_VALUE_WIDTH_CLASS_NAME)}>
          {props.readingContentWidth}px
        </span>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
