import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

const STORAGE_KEY = 'foliole-companion-text-scale';
const SCALES = [80, 90, 100, 110, 120, 130, 140, 150] as const;
const DEFAULT_SCALE = 100;

function readScale() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return SCALES.find(scale => String(scale) === saved) ?? DEFAULT_SCALE;
  } catch {
    return DEFAULT_SCALE;
  }
}

const TextScaleContext = createContext<{
  percent: number;
  saveError: boolean;
  update(percent: number): void;
} | null>(null);

export function CompanionTextScaleProvider({ children }: { children: ReactNode }) {
  const [percent, setPercent] = useState(readScale);
  const [saveError, setSaveError] = useState(false);

  useLayoutEffect(() => {
    const style = document.documentElement.style;
    style.setProperty('--companion-text-scale', String(percent / 100));
    return () => { style.removeProperty('--companion-text-scale'); };
  }, [percent]);

  const update = (next: number) => {
    const scale = SCALES.find(value => value === next);
    if (scale === undefined) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(scale));
      setPercent(scale);
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  };

  return <TextScaleContext.Provider value={{ percent, saveError, update }}>{children}</TextScaleContext.Provider>;
}

export function CompanionTextScaleControl() {
  const model = useContext(TextScaleContext);
  const t = useTranslation();
  if (!model) return null;
  return <div className="border-b border-companion-divider py-3">
    <label className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 text-sm text-foreground">
      <span>{t('companion.settings.appearance.textScale')}</span>
      <select
        className="min-h-11 max-w-full rounded border border-companion-divider bg-companion-content px-2 text-sm"
        onChange={event => model.update(Number(event.target.value))}
        value={model.percent}
      >
        {SCALES.map(percent => <option key={percent} value={percent}>{percent}%</option>)}
      </select>
    </label>
    {model.saveError && <p className="text-sm text-error" role="alert">{t('companion.reading.font.saveError')}</p>}
  </div>;
}
