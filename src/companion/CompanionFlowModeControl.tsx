import { Clock3, MoreHorizontal, Route } from 'lucide-react';
import { createContext, useContext, useState } from 'react';

import { formatReviewSessionElapsed } from '../features/review/model/reviewSessionElapsedLabel';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import type { ReviewToolbarProgressCounts } from '../features/review/model/reviewToolbarProgressLabel';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { reviewSessionModeOptions } from '../shared/ui/reviewSessionModeOptions';

import { CompanionMenuSheet } from './CompanionMenuSheet';

export type CompanionFlowModeControls = {
  mode: ReviewSessionMode;
  onChange(mode: ReviewSessionMode): void;
  disabled: boolean;
  progressCounts?: ReviewToolbarProgressCounts | undefined;
  sessionTiming?: CompanionFlowSessionTiming | undefined;
};
/** This Flow round's completed work and the time spent on each kind, as the desktop queue summary shows it. */
export type CompanionFlowSessionTiming = {
  reviewedItemCount: number; reviewElapsedMs: number; readTopicCount: number; readingElapsedMs: number;
};
export const CompanionFlowModeContext = createContext<CompanionFlowModeControls | null>(null);

export function CompanionFlowModeControl(props: { onSelect(): void }) {
  const controls = useContext(CompanionFlowModeContext);
  const t = useTranslation();
  if (!controls) return null;
  return <div>
    <div role="group" aria-label={t('desktop.reviewSession.mode.change')} className="flex border-b border-companion-divider py-3">
      {reviewSessionModeOptions.map(({ id, Icon, labelKey }) => (
        <button key={id} type="button" aria-pressed={controls.mode === id} disabled={controls.disabled}
          className={`inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-companion-accent disabled:opacity-50 ${controls.mode === id
            ? 'font-medium text-companion-accent'
            : 'text-foreground active:bg-companion-subtle/80'}`}
          onClick={() => { controls.onChange(id); props.onSelect(); }}>
          <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${controls.mode === id ? '' : 'text-companion-text-secondary'}`} strokeWidth={1.75} />
          <span>{t(labelKey)}</span>
        </button>
      ))}
    </div>
    {controls.progressCounts ? (
      <div className="flex min-h-11 items-center gap-3 border-b border-companion-divider py-2.5 text-sm">
        <Route aria-hidden="true" className="h-5 w-5 shrink-0 text-companion-text-secondary" />
        <span className="font-medium">{t('companion.reading.queue')}</span>
        <span className="ml-auto text-right tabular-nums text-companion-text-secondary">{t('settings.icons.node.item')} {controls.progressCounts.completedItemCount}/{controls.progressCounts.completedItemCount + controls.progressCounts.queuedItemCount}
          {' · '}
          {t('settings.icons.node.topic')} {controls.progressCounts.completedTopicCount}/{controls.progressCounts.completedTopicCount + controls.progressCounts.queuedTopicCount}</span>
      </div>
    ) : null}
    {controls.sessionTiming ? <FlowSessionTimingRows timing={controls.sessionTiming} /> : null}
  </div>;
}

function FlowSessionTimingRows({ timing }: { timing: CompanionFlowSessionTiming }) {
  const t = useTranslation();
  const rows = [
    { key: 'review', count: timing.reviewedItemCount, elapsedMs: timing.reviewElapsedMs,
      label: t('desktop.reviewSession.summary.reviewed'),
      unit: t(timing.reviewedItemCount === 1 ? 'desktop.reviewSession.summary.item' : 'desktop.reviewSession.summary.items') },
    { key: 'read', count: timing.readTopicCount, elapsedMs: timing.readingElapsedMs,
      label: t('desktop.reviewSession.summary.read'),
      unit: t(timing.readTopicCount === 1 ? 'desktop.reviewSession.summary.topic' : 'desktop.reviewSession.summary.topics') }
  ].filter(row => row.count > 0);
  if (!rows.length) return null;
  return <div role="group" aria-label={t('desktop.reviewSession.summary.label')} className="border-b border-companion-divider py-2.5 text-sm">
    {rows.map((row, index) => (
      <div key={row.key} className="flex min-h-9 items-center gap-3">
        <Clock3 aria-hidden="true" className={`h-5 w-5 shrink-0 text-companion-text-secondary ${index === 0 ? '' : 'invisible'}`} />
        <span className="font-medium">{row.label}</span>
        <span className="tabular-nums text-companion-text-secondary">{row.count} {row.unit}</span>
        <span className="ml-auto text-right tabular-nums text-companion-text-secondary">{formatReviewSessionElapsed(row.elapsedMs, t)}</span>
      </div>
    ))}
  </div>;
}

export function CompanionFlowModeMenu({ controls }: { controls: CompanionFlowModeControls }) {
  const [open, setOpen] = useState(false);
  const t = useTranslation();
  return <CompanionFlowModeContext.Provider value={controls}>
    <button type="button" aria-label={t('companion.reading.actions')} onClick={() => setOpen(true)}
      className="inline-flex h-11 w-10 items-center justify-center text-companion-text-secondary">
      <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
    </button>
    <CompanionMenuSheet open={open} onOpenChange={setOpen} title="Flow">
      <CompanionFlowModeControl onSelect={() => setOpen(false)} />
    </CompanionMenuSheet>
  </CompanionFlowModeContext.Provider>;
}
