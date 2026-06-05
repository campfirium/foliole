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
  DEFAULT_READING_PARAGRAPH_SPACING,
  READING_PARAGRAPH_SPACING_MAX,
  READING_PARAGRAPH_SPACING_MIN,
  READING_PARAGRAPH_SPACING_STEP
} from '../../model/appearanceSettings';

export function ReadingParagraphSpacingRow(props: {
  onReadingParagraphSpacingChange: (value: number) => void;
  readingParagraphSpacing: number;
}) {
  const t = useTranslation();

  return (
    <SettingsRow description={t('settings.appearance.paragraphSpacing.description')} title={t('settings.appearance.paragraphSpacing.title')}>
      <SettingsControlSlot className={SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-label={t('settings.appearance.paragraphSpacing.reset')}
          className={settingsResetButtonClassName()}
          disabled={props.readingParagraphSpacing === DEFAULT_READING_PARAGRAPH_SPACING}
          onClick={() => props.onReadingParagraphSpacingChange(DEFAULT_READING_PARAGRAPH_SPACING)}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
        </button>
        <input
          aria-label={t('settings.appearance.paragraphSpacing.title')}
          className={settingsRangeClassName(SETTINGS_RANGE_WIDTH_CLASS_NAME)}
          max={READING_PARAGRAPH_SPACING_MAX}
          min={READING_PARAGRAPH_SPACING_MIN}
          onChange={(event) => props.onReadingParagraphSpacingChange(Number(event.target.value))}
          step={READING_PARAGRAPH_SPACING_STEP}
          type="range"
          value={props.readingParagraphSpacing}
        />
        <span className={settingsControlValueClassName(SETTINGS_VALUE_WIDTH_CLASS_NAME)}>
          {props.readingParagraphSpacing.toFixed(2)}em
        </span>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
