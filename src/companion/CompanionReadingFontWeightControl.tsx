import { useCallback, useEffect, useRef, useState } from 'react';

import { readingFontFamily } from './companionReadableTypographyStyle';
import { activateReadingFont } from './companionReadingFonts';
import { CompanionReadingNumberControl } from './CompanionReadingNumberControl';
import type { CompanionReadingTypographySettings } from './companionReadingTypographySettings';

import { useTranslation } from '@/shared/localization/LocalizationProvider';
import { READING_FONT_WEIGHT_STEP } from '@/shared/typography/readingFontWeight';
import { adjacentReadingWeight, nearestReadingWeight } from '@/shared/typography/readingFontWeightProbe';
import { useDetectedReadingFontWeights } from '@/shared/typography/useDetectedReadingFontWeights';

export function CompanionReadingFontWeightControl(props: {
  settings: CompanionReadingTypographySettings;
  onChange(settings: CompanionReadingTypographySettings): void;
  fontRevision: number;
}) {
  const t = useTranslation();
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
  return <>
    <CompanionReadingNumberControl label={t('settings.appearance.fontWeight.title')}
      value={props.settings.fontWeight} min={weights[0] ?? 400} max={weights.at(-1) ?? 400}
      step={READING_FONT_WEIGHT_STEP} disabled={disabled} busy={status === 'loading'}
      onChange={update} onStep={direction => update(adjacentReadingWeight(props.settings.fontWeight, weights, direction))} />
    {status === 'error' ? <p role="alert" className="text-sm text-error">
      {t('settings.appearance.fontWeight.loadError')}
      <button className="min-h-11 px-2 text-foreground" type="button" onClick={() => setRetry(value => value + 1)}>
        {t('settings.appearance.fontWeight.retry')}
      </button>
    </p> : null}
  </>;
}
