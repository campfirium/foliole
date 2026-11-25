import { useState } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { resolveTopicPostponeDaysNextAt, resolveTopicPostponeDelayNextAt } from '../../lib/core/review/topicPostponeDelay';
import { readTopicPostponeUnit, writeTopicPostponeUnit } from '../features/settings/model/topicPostponeSettings';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import { settingsTouchChoiceButtonClassName, settingsTouchChoiceGroupClassName } from '../shared/ui/settingsTouchChoiceStyles';
import type { TopicDelayUnit } from '../store/topicDelayReading';

const DEFAULT_WEEKS = 4;
const DEFAULT_DAYS = 1;
const MAX = { weeks: 9, days: 30 } as const;

function previewNextAt(unit: TopicDelayUnit, amount: number, reading: WorkspaceSnapshot['nodesById'][string]['reading'], now: string) {
  const base = reading ?? { intervalDurationMs: 0, lastHandledAt: now };
  return unit === 'days' ? resolveTopicPostponeDaysNextAt(amount, now, base)
    : resolveTopicPostponeDelayNextAt({ level: amount, now, reading: base });
}

/** The desktop Postpone Topic panel for touch: weeks or days, a slider, and the date the topic comes back. */
export function CompanionTopicPostponeForm(props: {
  node: WorkspaceSnapshot['nodesById'][string];
  disabled: boolean;
  onSubmit(level: number, unit: TopicDelayUnit): void;
}) {
  const { locale, t } = useLocalization();
  const [unit, setUnit] = useState<TopicDelayUnit>(readTopicPostponeUnit);
  const [weeks, setWeeks] = useState(DEFAULT_WEEKS);
  const [dayDraft, setDayDraft] = useState(String(DEFAULT_DAYS));
  const dayCount = /^\d+$/.test(dayDraft) ? Number(dayDraft) : Number.NaN;
  const amount = unit === 'days' ? dayCount : weeks;
  const nextAt = previewNextAt(unit, amount, props.node.reading, new Date().toISOString());
  const nextDue = nextAt ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(nextAt)) : null;
  const unitLabel = new Intl.NumberFormat(locale, { style: 'unit', unit: unit === 'days' ? 'day' : 'week', unitDisplay: 'long' })
    .formatToParts(Number.isFinite(amount) ? amount : 0).find(part => part.type === 'unit')?.value;
  const changeUnit = (next: TopicDelayUnit) => {
    writeTopicPostponeUnit(next);
    setUnit(next);
  };

  return <form className="space-y-4 py-2" onSubmit={event => {
    event.preventDefault();
    if (nextDue && !props.disabled) props.onSubmit(amount, unit);
  }}>
    <div className={settingsTouchChoiceGroupClassName}>
      {(['weeks', 'days'] as const).map(option => <button key={option} type="button" aria-pressed={unit === option}
        className={settingsTouchChoiceButtonClassName(unit === option)} onClick={() => changeUnit(option)}>
        {t(`desktop.reviewDelay.mode.${option}`)}
      </button>)}
    </div>
    <div className="flex items-end justify-between gap-4">
      <div className="flex min-w-0 items-baseline gap-2">
        {unit === 'days' ? <input aria-label={t('desktop.reviewDelay.daysInput')} inputMode="numeric" value={dayDraft}
          className="w-20 min-w-0 border-b border-companion-divider bg-transparent text-3xl font-semibold tabular-nums outline-none focus:border-companion-accent"
          onChange={event => setDayDraft(event.currentTarget.value)} />
          : <span className="text-3xl font-semibold tabular-nums">{weeks}</span>}
        <span className="text-sm text-companion-text-secondary">{unitLabel}</span>
      </div>
      <div className="text-right text-sm">
        <div className="text-xs text-companion-text-secondary">{t('desktop.reviewDelay.nextDue')}</div>
        <output className="font-medium">{nextDue ?? '—'}</output>
      </div>
    </div>
    <input aria-label={t('desktop.reviewDelay.slider')} className="min-h-11 w-full accent-companion-accent" type="range"
      min={0} max={MAX[unit]} step={1} value={unit === 'days' ? Math.min(MAX.days, Number.isFinite(dayCount) ? dayCount : 0) : weeks}
      onChange={event => {
        const next = event.currentTarget.valueAsNumber;
        if (unit === 'days') setDayDraft(String(next));
        else setWeeks(next);
      }} />
    <button className="min-h-11 w-full rounded bg-companion-subtle px-3 text-sm disabled:opacity-40" type="submit"
      disabled={props.disabled || !nextDue}>{t('desktop.reviewDelay.confirm')}</button>
  </form>;
}
