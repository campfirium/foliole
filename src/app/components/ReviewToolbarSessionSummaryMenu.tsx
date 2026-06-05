import { Clock3 } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuTrigger
} from '../../shared/ui';

import type { ReviewToolbarSessionSummary, ReviewToolbarSessionSummaryStatus } from './ReviewToolbarSessionFrame';

type ReviewSessionTranslate = ReturnType<typeof useTranslation>;

function formatElapsedMs(elapsedMs: number, t: ReviewSessionTranslate) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return t('desktop.reviewSession.summary.justNow');
  const totalMinutes = Math.max(1, Math.round(elapsedMs / 60000));
  if (totalMinutes < 60) return `${totalMinutes} ${t('desktop.reviewSession.summary.minute')}`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes
    ? `${hours} ${t('desktop.reviewSession.summary.hour')} ${minutes} ${t('desktop.reviewSession.summary.minute')}`
    : `${hours} ${t('desktop.reviewSession.summary.hour')}`;
}

function SummaryRow({
  count,
  elapsedMs,
  label,
  t,
  unitPlural,
  unitSingular
}: {
  count: number;
  elapsedMs: number;
  label: string;
  t: ReviewSessionTranslate;
  unitPlural: string;
  unitSingular: string;
}) {
  if (count <= 0) return null;
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4">
      <span className="text-xs text-foreground/48">{label}</span>
      <span className="text-right text-lg font-medium leading-none text-foreground/82">
        {count}
        <span className="ml-1.5 text-xs font-normal text-foreground/45">{count === 1 ? unitSingular : unitPlural}</span>
      </span>
      <span className="min-w-16 text-right text-xs tabular-nums text-foreground/45">{formatElapsedMs(elapsedMs, t)}</span>
    </div>
  );
}

function getSummaryTitle(status: ReviewToolbarSessionSummaryStatus, t: ReviewSessionTranslate) {
  if (status === 'clear') return t('desktop.reviewSession.summary.clear');
  if (status === 'in-progress') return t('desktop.reviewSession.summary.inProgress');
  return t('desktop.reviewSession.summary.notStarted');
}

function QueueSummaryRows({ summary, t }: { summary: ReviewToolbarSessionSummary; t: ReviewSessionTranslate }) {
  const hasRows = summary.reviewedItemCount > 0 || summary.readTopicCount > 0;
  if (!hasRows) {
    return <p className="text-xs text-foreground/45">{t('desktop.reviewSession.summary.none')}</p>;
  }
  return (
    <div className="space-y-3">
      <SummaryRow count={summary.reviewedItemCount} elapsedMs={summary.reviewElapsedMs} label={t('desktop.reviewSession.summary.reviewed')} t={t} unitPlural={t('desktop.reviewSession.summary.items')} unitSingular={t('desktop.reviewSession.summary.item')} />
      <SummaryRow count={summary.readTopicCount} elapsedMs={summary.readingElapsedMs} label={t('desktop.reviewSession.summary.read')} t={t} unitPlural={t('desktop.reviewSession.summary.topics')} unitSingular={t('desktop.reviewSession.summary.topic')} />
    </div>
  );
}

export function ReviewToolbarSessionSummaryMenu({ summary }: { summary: ReviewToolbarSessionSummary }) {
  const t = useTranslation();
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label={t('desktop.reviewSession.summary.label')}
          className="inline-flex size-8 items-center justify-center rounded-md text-foreground/38 outline-none transition-colors hover:bg-foreground/[0.04] hover:text-foreground/65 focus-visible:ring-1 focus-visible:ring-border-strong"
          type="button"
        >
          <Clock3 aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="center" avoidCollisions={false} className="w-64 p-4" side="top" sideOffset={10}>
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.02em] text-foreground/45">{getSummaryTitle(summary.status, t)}</div>
        <QueueSummaryRows summary={summary} t={t} />
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}
