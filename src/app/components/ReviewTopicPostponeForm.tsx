import { useEffect, useRef, useState } from 'react';

import { useLocalization, useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton } from '../../shared/ui';
import type { useReviewTopicDelayPanel } from '../hooks/useReviewTopicDelayPanel';

type Props = Pick<ReturnType<typeof useReviewTopicDelayPanel>,
  'close' | 'dueDateLabel' | 'isSubmitting' | 'previewDays' | 'selectedLevel' | 'setSelectedLevel' | 'submit' | 'unit'>;

const DAY_SLIDER_MAX = 30;
const DEFAULT_DAYS = '1';

function DelaySlider({ min, max, value, suffix, onChange }: {
  min: number; max: number; value: number; suffix: string; onChange: (value: number) => void;
}) {
  const t = useTranslation();
  const progress = `${((value - min) / (max - min)) * 100}%`;
  return (
    <div>
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/16" />
        <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/32" style={{ width: progress }} />
        <div aria-hidden="true"
          className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--app-control-border-color)] bg-[var(--app-surface-control-bg)] shadow-control"
          style={{ left: progress }} />
        <input aria-label={t('desktop.reviewDelay.slider')}
          className="absolute inset-0 h-5 w-full cursor-pointer opacity-0" type="range"
          min={min} max={max} step={1} value={value} onChange={event => onChange(Number(event.currentTarget.value))} />
      </div>
      <div aria-hidden="true" className="mt-2 flex justify-between text-[11px] font-medium text-muted-foreground/75">
        <span>{min}{suffix}</span><span>{max}{suffix}</span>
      </div>
    </div>
  );
}

export function ReviewTopicPostponeForm(props: Props) {
  const { locale, t } = useLocalization();
  const input = useRef<HTMLInputElement>(null);
  const [dayDraft, setDayDraft] = useState<string | null>(null);
  const days = dayDraft ?? DEFAULT_DAYS;
  const dayMode = props.unit === 'days';
  const dayCount = /^\d+$/.test(days) ? Number(days) : Number.NaN;
  const nextDue = dayMode ? props.previewDays(dayCount) : props.dueDateLabel;
  const max = dayMode ? DAY_SLIDER_MAX : 9;
  const value = dayMode ? Math.min(max, dayCount || 0) : props.selectedLevel;
  const label = new Intl.NumberFormat(locale, { style: 'unit', unit: dayMode ? 'day' : 'week', unitDisplay: 'long' })
    .formatToParts(value).find(part => part.type === 'unit')?.value;
  useEffect(() => {
    if (dayMode) input.current?.focus();
  }, [dayMode]);

  return (
    <form className="grid gap-4" onSubmit={event => {
      event.preventDefault();
      if (nextDue && !props.isSubmitting) void props.submit(dayMode ? dayCount : props.selectedLevel);
    }}>
      <div className="grid grid-cols-[1fr_auto] items-end gap-5">
        <div className="flex min-w-0 items-baseline gap-3">
          {dayMode ? <input aria-label={t('desktop.reviewDelay.daysInput')} inputMode="numeric" ref={input}
            value={dayDraft ?? ''} placeholder={dayDraft === null ? DEFAULT_DAYS : undefined}
            style={{ width: `${Math.min(9, Math.max(3, days.length))}ch` }}
            className="min-w-0 rounded-sm border-b border-border bg-transparent text-3xl font-semibold leading-none tabular-nums outline-none placeholder:text-current focus:border-foreground/60"
            onChange={event => setDayDraft(event.currentTarget.value)} />
            : <span className="text-3xl font-semibold leading-none tabular-nums">{props.selectedLevel}</span>}
          <span className="text-sm font-semibold text-foreground/65">{label}</span>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/50">{t('desktop.reviewDelay.nextDue')}</div>
          <output className="mt-1 block text-sm font-semibold text-foreground/72">{nextDue ?? '—'}</output>
        </div>
      </div>
      <DelaySlider min={0} max={max} value={value} suffix={dayMode ? 'D' : 'W'}
        onChange={dayMode ? next => setDayDraft(String(next)) : props.setSelectedLevel} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-foreground/62">
          <kbd className="rounded-md border border-border px-2 py-0.5 text-xs font-semibold">{dayMode ? '↵' : '0-9'}</kbd>
          <span>{t(dayMode ? 'desktop.reviewDelay.enterHint' : 'desktop.reviewDelay.keyboardHint')}</span>
        </div>
        <div className="flex items-center gap-2">
          <AppButton onClick={props.close} size="sm" type="button" variant="ghost">{t('desktop.reviewDelay.cancel')}</AppButton>
          <AppButton disabled={!nextDue || props.isSubmitting} size="sm" type="submit">{t('desktop.reviewDelay.confirm')}</AppButton>
        </div>
      </div>
    </form>
  );
}
