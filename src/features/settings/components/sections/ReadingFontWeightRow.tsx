import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  READING_FONT_WEIGHT_DEFAULT, READING_FONT_WEIGHT_MAX, READING_FONT_WEIGHT_MIN,
  READING_FONT_WEIGHT_STEP
} from '../../../../shared/typography/readingFontWeight';
import { adjacentReadingWeight, nearestReadingWeight } from '../../../../shared/typography/readingFontWeightProbe';
import {
  SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME, SETTINGS_RANGE_WIDTH_CLASS_NAME, SETTINGS_VALUE_WIDTH_CLASS_NAME,
  SettingsControlSlot, SettingsRow, settingsButtonClassName, settingsControlValueClassName,
  settingsRangeClassName, settingsResetButtonClassName
} from '../../../../shared/ui';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';
import { useReadingFontWeights } from '../../context/useReadingFontWeights';

export function ReadingFontWeightRow() {
  const t = useTranslation();
  const { interfaceFontPreset, customInterfaceFont, readingFontWeightSettings: settings } = useAppearanceSettings();
  const [retry, setRetry] = useState(0);
  const { status, weights } = useReadingFontWeights(interfaceFontPreset, customInterfaceFont, retry);
  const disabled = status !== 'ready' || weights.length < 2;
  useEffect(() => {
    if (status !== 'ready') return;
    const next = nearestReadingWeight(settings.value, weights);
    if (next !== settings.value) void settings.update(next);
  }, [settings, status, weights]);
  return (
    <SettingsRow title={t('settings.appearance.fontWeight.title')}
      description={t('settings.appearance.fontWeight.description')}>
      <SettingsControlSlot className="flex-col items-end gap-2">
        <div className={`flex items-center gap-2 ${SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME}`}>
          <button aria-label={t('settings.appearance.fontWeight.reset')} className={settingsResetButtonClassName()}
            disabled={disabled || settings.value === READING_FONT_WEIGHT_DEFAULT}
            onClick={() => void settings.update(READING_FONT_WEIGHT_DEFAULT)} type="button">
            <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
          </button>
          <input aria-label={t('settings.appearance.fontWeight.title')} className={settingsRangeClassName(SETTINGS_RANGE_WIDTH_CLASS_NAME)}
            disabled={disabled} min={READING_FONT_WEIGHT_MIN} max={READING_FONT_WEIGHT_MAX} step={READING_FONT_WEIGHT_STEP}
            aria-valuetext={String(settings.value)} aria-busy={status === 'loading'}
            type="range" value={settings.value}
            onChange={(event) => {
              const next = nearestReadingWeight(Number(event.target.value), weights);
              if (next !== settings.value) void settings.update(next);
            }}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === 'Home' ? weights[0] : event.key === 'End' ? weights.at(-1)
                : adjacentReadingWeight(settings.value, weights, ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : -1);
              if (next !== undefined && next !== settings.value) void settings.update(next);
            }} />
          <span className={settingsControlValueClassName(SETTINGS_VALUE_WIDTH_CLASS_NAME)}>{settings.value}</span>
        </div>
        {status === 'error' ? <p role="alert" className="text-xs text-destructive">
          {t('settings.appearance.fontWeight.loadError')}
          <button className={settingsButtonClassName()} type="button" onClick={() => setRetry(retry + 1)}>{t('settings.appearance.fontWeight.retry')}</button>
        </p> : null}
        {settings.saveError ? <p role="alert" className="text-xs text-destructive">
          {t('settings.appearance.fontWeight.saveError')}
          <button className={settingsButtonClassName()} type="button" disabled={settings.saving}
            onClick={() => void settings.update(settings.value)}>{t('settings.appearance.fontWeight.retry')}</button>
        </p> : null}
      </SettingsControlSlot>
    </SettingsRow>
  );
}
