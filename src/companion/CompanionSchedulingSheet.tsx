import { ChevronRight, ChevronsRight } from 'lucide-react';
import { useState, useSyncExternalStore, type ReactNode } from 'react';

import {
  formatDateTime, formatDurationDays, formatDurationMs, formatNumber, formatPercent, formatPriorityWeight,
  resolveSchedulingPanelData, type SchedulingPanelData
} from '../features/review/model/schedulingPanelData';
import {
  getCurrentReviewSchedulerSettings, subscribeReviewSchedulerSettings
} from '../features/settings/model/reviewSchedulerSettings';
import { useTranslation, type Translate } from '../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../shared/localization/translations';

import { CompanionBottomSheet } from './CompanionBottomSheet';
import { canEditCompanionNodeReviewOptions, CompanionNodeReviewOptionsContent } from './CompanionNodeReviewOptions';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';

type SchedulingField = [key: TranslationKey, value: ReactNode];

function SchedulingFields({ fields, title, t }: { fields: SchedulingField[]; title: string; t: Translate }) {
  return <section className="border-t border-companion-divider py-3">
    <h3 className="mb-2 text-xs font-medium text-companion-text-secondary">{title}</h3>
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
      {fields.map(([key, value]) => <div key={key} className="contents">
        <dt className="min-w-0 py-2.5 text-sm text-companion-text-secondary [overflow-wrap:anywhere]">{t(key)}</dt>
        <dd className="min-w-0 text-end text-sm tabular-nums">{value}</dd>
      </div>)}
    </dl>
  </section>;
}

function PriorityValue({ data, owner, onOpenSource }: { data: SchedulingPanelData; owner?: string | undefined; onOpenSource?: (() => void) | undefined }) {
  const t = useTranslation();
  const { node, priority } = data;
  if (priority.source === 'explicit') return <strong>P{priority.value}</strong>;
  const Icon = priority.enforced ? ChevronsRight : ChevronRight;
  return <span className="inline-flex items-center gap-1 whitespace-nowrap">
    {priority.enforced && node.priority != null && <span className="text-foreground/52">P{node.priority}</span>}
    {onOpenSource ? <button type="button" className="grid size-11 place-items-center text-companion-text-secondary"
      aria-label={`${t('desktop.diagnostics.scheduling.prioritySource')}: ${owner}`} onClick={onOpenSource}>
      <Icon aria-hidden="true" className="size-4" />
    </button> : <Icon role="img" aria-label={t('desktop.diagnostics.scheduling.prioritySource.default')}
      className="size-4 text-companion-text-secondary" />}
    <strong>P{priority.value}</strong>
  </span>;
}

function topicFields(data: SchedulingPanelData, t: Translate): { schedule: SchedulingField[]; history: SchedulingField[] } {
  const reading = data.node.reading;
  const current = reading?.intervalDurationMs ?? data.initialReadingIntervalMs;
  const hasPrevious = reading && reading.repetitionCount > 1;
  return {
    schedule: [
      ['desktop.diagnostics.scheduling.nextScheduled', formatDateTime(data.nextReadingAt)],
      ['desktop.diagnostics.scheduling.initialInterval', formatDurationMs(data.initialReadingIntervalMs)],
      ['desktop.diagnostics.scheduling.currentInterval', formatDurationMs(current)],
      ['desktop.diagnostics.scheduling.previousInterval', hasPrevious
        ? formatDurationMs(reading.intervalDurationMs / reading.intervalGrowthFactor) : t('desktop.diagnostics.scheduling.none')]
    ],
    history: [
      ['desktop.diagnostics.scheduling.lastHandled', reading ? formatDateTime(reading.lastHandledAt) : t('desktop.diagnostics.scheduling.none')],
      ['desktop.diagnostics.scheduling.readCount', reading?.repetitionCount ?? 0]
    ]
  };
}

function itemFields(data: SchedulingPanelData, t: Translate): { schedule: SchedulingField[]; history: SchedulingField[]; decision: SchedulingField[] } {
  const review = data.node.review;
  return {
    schedule: [
      ['desktop.diagnostics.scheduling.nextDue', review?.due ? formatDateTime(review.due) : t('desktop.diagnostics.scheduling.notScheduled')],
      ['desktop.diagnostics.scheduling.lastReview', review?.lastReviewAt ? formatDateTime(review.lastReviewAt) : t('desktop.diagnostics.scheduling.none')],
      ['desktop.diagnostics.scheduling.scheduledInterval', formatDurationDays(review?.scheduledDays ?? 0)]
    ],
    decision: [
      ['desktop.diagnostics.scheduling.retention', formatPercent(data.desiredRetention.value)],
      ['desktop.diagnostics.scheduling.retrievability', data.retrievability == null ? t('desktop.diagnostics.scheduling.notAvailable') : formatPercent(data.retrievability)],
      ['desktop.diagnostics.scheduling.elapsed', formatDurationDays(review?.elapsedDays ?? 0)],
      ['desktop.diagnostics.scheduling.stability', formatNumber(review?.stability ?? 0)],
      ['desktop.diagnostics.scheduling.difficulty', formatNumber(review?.difficulty ?? 0)]
    ],
    history: [
      ['desktop.diagnostics.scheduling.reviewCount', review?.reps ?? 0],
      ['desktop.diagnostics.scheduling.lapses', review?.lapses ?? 0]
    ]
  };
}

function SchedulingDetails({ data, priority }: { data: SchedulingPanelData; priority: ReactNode }) {
  const t = useTranslation();
  const item = data.kind === 'item' ? itemFields(data, t) : null;
  const fields = item ?? topicFields(data, t);
  return <>
    <SchedulingFields t={t} title={t('desktop.diagnostics.scheduling.schedule')} fields={fields.schedule} />
    <SchedulingFields t={t} title={t('desktop.diagnostics.scheduling.decisionParameters')} fields={[
      ['desktop.diagnostics.scheduling.priority', priority],
      ['desktop.diagnostics.scheduling.priorityRatio', formatNumber(data.priorityRatio)],
      ['desktop.diagnostics.scheduling.priorityWeight', formatPriorityWeight(data.priority.value, data.priorityRatio)],
      ...(item?.decision ?? [['desktop.diagnostics.scheduling.growthFactor', formatNumber(data.readingGrowthFactor)] as SchedulingField])
    ]} />
    <SchedulingFields t={t} title={t('desktop.diagnostics.scheduling.history')} fields={fields.history} />
  </>;
}

export function CompanionSchedulingSheet({ nodeId, onClose }: { nodeId: string; onClose(): void }) {
  const t = useTranslation();
  const actions = useCompanionWorkspaceActions();
  const settings = useSyncExternalStore(subscribeReviewSchedulerSettings, getCurrentReviewSchedulerSettings);
  const [sourceNodeId, setSourceNodeId] = useState<string | null>(null);
  const nodes = actions?.snapshot?.nodesById;
  if (!nodes) return null;
  const data = resolveSchedulingPanelData({ activeNodeId: nodeId, nodesById: nodes, reviewSchedulerSettings: settings });
  if (!data || data.kind === 'unsupported') return null;
  const ownerId = data.priority.ownerNodeId;
  const owner = ownerId && data.priority.source !== 'explicit' ? nodes[ownerId] : undefined;
  const canOpen = owner && canEditCompanionNodeReviewOptions(owner.id, nodes);
  const source = sourceNodeId ? nodes[sourceNodeId] : undefined;
  const title = source ? `${t('desktop.nodeReview.title')} · ${source.title}` : t('desktop.diagnostics.scheduling.title');
  return <CompanionBottomSheet title={title} open onOpenChange={open => { if (!open) onClose(); }}
    leadingAction={source && <button className="min-h-11 shrink-0 px-2 text-sm" type="button" onClick={() => setSourceNodeId(null)}>
      {t('companion.back')}
    </button>}>
    {source ? <CompanionNodeReviewOptionsContent nodeId={source.id} /> : <SchedulingDetails data={data}
      priority={<PriorityValue data={data} owner={owner?.title}
        onOpenSource={canOpen ? () => setSourceNodeId(owner.id) : undefined} />} />}
  </CompanionBottomSheet>;
}
