import { RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { readingFontFamily } from './companionReadableTypographyStyle';
import { activateReadingFont } from './companionReadingFonts';
import type { CompanionReadingTypographySettings } from './companionReadingTypographySettings';

import { useTranslation } from '@/shared/localization/LocalizationProvider';
import { READING_FONT_WEIGHT_DEFAULT, READING_FONT_WEIGHT_MIN, READING_FONT_WEIGHT_MAX,
  READING_FONT_WEIGHT_STEP } from '@/shared/typography/readingFontWeight';
import { adjacentReadingWeight, nearestReadingWeight } from '@/shared/typography/readingFontWeightProbe';
import { useDetectedReadingFontWeights } from '@/shared/typography/useDetectedReadingFontWeights';

export function CompanionReadingFontWeightControl(props: {
  settings: CompanionReadingTypographySettings;
  onChange(settings: CompanionReadingTypographySettings): void;
  fontRevision: number;
}) {
  const t = useTranslation();
  const id = useId();
  const current = useRef(props);
  current.current = props;
  const [retry, setRetry] = useState(0);
  const selected = props.settings.fontFamily;
  const prepare = useCallback(async () => {
    if (selected.startsWith('custom:') && !await activateReadingFont(selected.slice(7))) {
      throw new Error('Font is missing');
    }
  }, [selected]);
  const { status, weights } = useDetectedReadingFontWeights(readingFontFamily(selected), retry + props.fontRevision, prepare);
  const disabled = status !== 'ready' || weights.length < 2;
  const update = useCallback((fontWeight: number) => current.current.onChange({ ...current.current.settings, fontWeight }), []);
  useEffect(() => {
    if (status !== 'ready') return;
    const next = nearestReadingWeight(props.settings.fontWeight, weights);
    if (next !== props.settings.fontWeight) update(next);
  }, [props.settings.fontWeight, status, update, weights]);
  return <div className="border-b border-companion-divider py-2">
    <label htmlFor={id} className="text-sm font-medium text-foreground">
      {t('settings.appearance.fontWeight.title')}
    </label>
      <div className="flex min-h-11 items-center gap-2">
        <button aria-label={t('settings.appearance.fontWeight.reset')} type="button"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-foreground disabled:opacity-40"
          disabled={disabled || props.settings.fontWeight === READING_FONT_WEIGHT_DEFAULT}
          onClick={() => update(READING_FONT_WEIGHT_DEFAULT)}>
          <RotateCcw aria-hidden="true" size={18} />
        </button>
        <input id={id} aria-label={t('settings.appearance.fontWeight.title')} type="range"
          className="min-h-11 min-w-0 flex-1 accent-companion-accent disabled:opacity-40"
          min={READING_FONT_WEIGHT_MIN} max={READING_FONT_WEIGHT_MAX} step={READING_FONT_WEIGHT_STEP}
          disabled={disabled} aria-busy={status === 'loading'} value={props.settings.fontWeight}
          onChange={event => update(nearestReadingWeight(Number(event.target.value), weights))}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? weights[0] : event.key === 'End' ? weights.at(-1)
              : adjacentReadingWeight(props.settings.fontWeight, weights, ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : -1);
            if (next !== undefined) update(next);
          }} />
        <output className="min-w-10 text-right text-sm tabular-nums text-companion-text-secondary">
          {props.settings.fontWeight}
        </output>
      </div>
    {status === 'error' ? <p role="alert" className="text-sm text-error">
      {t('settings.appearance.fontWeight.loadError')}
      <button className="min-h-11 px-2 text-foreground" type="button" onClick={() => setRetry(value => value + 1)}>
        {t('settings.appearance.fontWeight.retry')}
      </button>
    </p> : null}
  </div>;
}
