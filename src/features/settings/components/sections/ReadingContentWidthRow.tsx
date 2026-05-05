import { RotateCcw } from 'lucide-react';

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
  return (
    <SettingsRow description="Set the maximum reading width for topic content." title="Reading width">
      <SettingsControlSlot className={SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-label="Reset reading width"
          className={settingsResetButtonClassName()}
          disabled={props.readingContentWidth === READING_CONTENT_WIDTH_DEFAULT}
          onClick={() => props.onReadingContentWidthChange(READING_CONTENT_WIDTH_DEFAULT)}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
        </button>
        <input
          aria-label="Reading width"
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
