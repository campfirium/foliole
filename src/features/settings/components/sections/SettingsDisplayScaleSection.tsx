import { RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
  APP_DISPLAY_SCALE_STEP,
  MAX_APP_DISPLAY_SCALE_PERCENT,
  MIN_APP_DISPLAY_SCALE_PERCENT
} from '../../model/displayScaleSettings';

import { SettingsMacOsFontSmoothingRow } from './SettingsMacOsFontSmoothingRow';

export function SettingsDisplayScaleSection() {
  const t = useTranslation();
  const displayScale = useDisplayScale();
  const [draftPercent, setDraftPercent] = useState(displayScale.appDisplayScalePercent);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isDragging = useRef(false);
  useEffect(() => {
    if (!isDragging.current) setDraftPercent(displayScale.appDisplayScalePercent);
  }, [displayScale.appDisplayScalePercent]);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const commit = () => {
      isDragging.current = false;
      displayScale.setAppDisplayScalePercent(Number(input.value));
    };
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, [displayScale.setAppDisplayScalePercent]);
  const reset = () => {
    setDraftPercent(DEFAULT_APP_DISPLAY_SCALE_PERCENT);
    displayScale.setAppDisplayScalePercent(DEFAULT_APP_DISPLAY_SCALE_PERCENT);
  };
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
            onClick={reset}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={18} />
          </button>
          <input
            aria-label={t('settings.appearance.displayScale.sliderAria')}
            className={settingsRangeClassName(SETTINGS_RANGE_WIDTH_CLASS_NAME)}
            max={MAX_APP_DISPLAY_SCALE_PERCENT}
            min={MIN_APP_DISPLAY_SCALE_PERCENT}
            onChange={(event) => setDraftPercent(Number(event.currentTarget.value))}
            onInput={(event) => setDraftPercent(Number(event.currentTarget.value))}
            onPointerDown={() => { isDragging.current = true; }}
            ref={inputRef}
            step={APP_DISPLAY_SCALE_STEP}
            type="range"
            value={draftPercent}
          />
          <span className={settingsControlValueClassName(SETTINGS_VALUE_WIDTH_CLASS_NAME)}>{draftPercent}%</span>
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsMacOsFontSmoothingRow />
    </SettingsSection>
  );
}
