import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  READING_FONT_WEIGHT_DEFAULT, READING_FONT_WEIGHT_MAX, READING_FONT_WEIGHT_MIN,
  READING_FONT_WEIGHT_STEP, normalizeReadingFontWeight
} from '../../../../shared/typography/readingFontWeight';
import {
  SettingsControlSlot, SettingsRow, settingsButtonClassName, settingsFieldClassName,
  settingsRangeClassName, settingsResetButtonClassName
} from '../../../../shared/ui';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';

function useNotoReadingFont(enabled: boolean, retry: number) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setStatus('loading');
    void document.fonts?.load('400 17px "Foliole Noto Sans SC"').then((faces) => {
      if (active) setStatus(faces.length > 0 ? 'ready' : 'error');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [enabled, retry]);
  return status;
}

export function ReadingFontWeightRow() {
  const t = useTranslation();
  const { interfaceFontPreset, readingFontWeightSettings: settings } = useAppearanceSettings();
  const enabled = interfaceFontPreset === 'noto-sans-sc';
  const [retry, setRetry] = useState(0);
  const status = useNotoReadingFont(enabled, retry);
  const [draft, setDraft] = useState(String(settings.value));
  useEffect(() => setDraft(String(settings.value)), [settings.value]);
  const disabled = !enabled || status !== 'ready';
  const commit = () => {
    if (draft.trim() === '' || !Number.isFinite(Number(draft))) {
      setDraft(String(settings.value));
      return;
    }
    const next = normalizeReadingFontWeight(draft);
    setDraft(String(next));
    void settings.update(next);
  };
  return (
    <SettingsRow title={t('settings.appearance.fontWeight.title')}
      description={t('settings.appearance.fontWeight.description')}>
      <SettingsControlSlot className="flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <button aria-label={t('settings.appearance.fontWeight.reset')} className={settingsResetButtonClassName()}
            disabled={disabled || settings.value === READING_FONT_WEIGHT_DEFAULT}
            onClick={() => void settings.update(READING_FONT_WEIGHT_DEFAULT)} type="button">
            <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
          </button>
          <input aria-label={t('settings.appearance.fontWeight.slider')} className={settingsRangeClassName('w-36')}
            disabled={disabled} min={READING_FONT_WEIGHT_MIN} max={READING_FONT_WEIGHT_MAX} step={READING_FONT_WEIGHT_STEP}
            type="range" value={settings.value} onChange={(event) => void settings.update(Number(event.target.value))} />
          <input aria-label={t('settings.appearance.fontWeight.title')} className={settingsFieldClassName('w-20')}
            disabled={disabled} type="number" min={READING_FONT_WEIGHT_MIN} max={READING_FONT_WEIGHT_MAX} step={1}
            value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); commit(); }
              if (event.key === 'Escape') { event.stopPropagation(); setDraft(String(settings.value)); }
            }} />
        </div>
        <div className="flex items-center gap-2">
          {[400, 450, 500].map((weight) => <button key={weight} type="button" disabled={disabled}
            className={settingsButtonClassName()} onClick={() => void settings.update(weight)}>{weight}</button>)}
        </div>
        {enabled && status === 'loading' ? <p role="status" className="text-xs text-muted-foreground">{t('settings.appearance.fontWeight.loading')}</p> : null}
        {enabled && status === 'error' ? <p role="alert" className="text-xs text-destructive">
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
