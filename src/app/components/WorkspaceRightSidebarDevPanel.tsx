import type { ReactNode } from 'react';

import type { Node, NodeReadingProfile } from '../../features/nodes/model/nodeTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import {
  inspectorDefinitionListClassName,
  inspectorDefinitionTermClassName,
  inspectorDefinitionValueClassName,
  inspectorListHeadingClassName,
  inspectorListMetaClassName,
  inspectorListTopDividerClassName,
  inspectorListTitleClassName
} from '../../shared/ui';

import {
  formatDateTime,
  formatDurationDays,
  formatDurationMs,
  formatNumber,
  formatPercent,
  formatPriority,
  formatPriorityWeight,
  resolveSchedulingPanelData,
  type SchedulingPanelData
} from './WorkspaceRightSidebarSchedulingPanelModel';

interface WorkspaceRightSidebarDevPanelProps {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  reviewSchedulerSettings: ReviewSchedulerSettings;
}

function SchedulingInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className={inspectorDefinitionTermClassName}>{label}</dt>
      <dd className={inspectorDefinitionValueClassName}>{value}</dd>
    </>
  );
}

function SchedulingSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className={`mx-1 py-4 first:pt-0 ${inspectorListTopDividerClassName}`}>
      <h3 className={`mb-2 px-3 pb-0 ${inspectorListHeadingClassName}`}>{title}</h3>
      <dl className={inspectorDefinitionListClassName}>{children}</dl>
    </section>
  );
}

type SchedulingTranslate = Translate;

function ReadingProfileSection({ reading, t }: { reading: NodeReadingProfile | null | undefined; t: SchedulingTranslate }) {
  if (!reading) {
    return (
      <SchedulingSection title={t('desktop.diagnostics.scheduling.history')}>
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.lastHandled')} value={t('desktop.diagnostics.scheduling.none')} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.readCount')} value="0" />
      </SchedulingSection>
    );
  }

  return (
    <SchedulingSection title={t('desktop.diagnostics.scheduling.history')}>
      <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.lastHandled')} value={formatDateTime(reading.lastHandledAt)} />
      <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.readCount')} value={String(reading.repetitionCount)} />
    </SchedulingSection>
  );
}

function EmptyDevPanelState({ t }: { t: SchedulingTranslate }) {
  return (
    <section className="px-1 py-3">
      <h3 className={inspectorListTitleClassName}>{t('desktop.diagnostics.scheduling.title')}</h3>
      <p className={`mt-1 ${inspectorListMetaClassName}`}>{t('desktop.diagnostics.scheduling.empty')}</p>
    </section>
  );
}

function ReadingTopicContent({ data, t }: { data: SchedulingPanelData; t: SchedulingTranslate }) {
  const { node, priority } = data;
  const currentInterval = node.reading?.intervalDurationMs ?? data.initialReadingIntervalMs;
  const previousInterval = node.reading && node.reading.repetitionCount > 1
    ? node.reading.intervalDurationMs / node.reading.intervalGrowthFactor
    : null;

  return (
    <div className="flex min-h-0 flex-col">
      <SchedulingHeader subtitle={t('desktop.diagnostics.scheduling.topic')} t={t} />
      <SchedulingSection title={t('desktop.diagnostics.scheduling.schedule')}>
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.nextScheduled')} value={formatDateTime(data.nextReadingAt)} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.initialInterval')} value={formatDurationMs(data.initialReadingIntervalMs)} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.currentInterval')} value={formatDurationMs(currentInterval)} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.previousInterval')} value={previousInterval ? formatDurationMs(previousInterval) : t('desktop.diagnostics.scheduling.none')} />
      </SchedulingSection>
      <SchedulingSection title={t('desktop.diagnostics.scheduling.decisionParameters')}>
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.priority')} value={formatPriority(priority.value)} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.priorityRatio')} value={formatNumber(data.priorityRatio)} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.priorityWeight')} value={formatPriorityWeight(priority.value, data.priorityRatio)} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.growthFactor')} value={formatNumber(data.readingGrowthFactor)} />
      </SchedulingSection>
      <ReadingProfileSection reading={node.reading} t={t} />
    </div>
  );
}

function SchedulingHeader({ subtitle, t }: { subtitle: string; t: SchedulingTranslate }) {
  return (
    <section className="px-1 pb-4">
      <div className="min-w-0">
        <h3 className={inspectorListTitleClassName}>{t('desktop.diagnostics.scheduling.title')}</h3>
        <p className={`mt-1 ${inspectorListMetaClassName}`}>{subtitle}</p>
      </div>
    </section>
  );
}

function ReviewItemContent({ data, t }: { data: SchedulingPanelData; t: SchedulingTranslate }) {
  const { desiredRetention, node, priority, retrievability } = data;
  const nextDue = node.review?.due ?? '';

  return (
    <div className="flex min-h-0 flex-col">
      <SchedulingHeader subtitle={t('desktop.diagnostics.scheduling.item')} t={t} />

      <SchedulingSection title={t('desktop.diagnostics.scheduling.schedule')}>
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.nextDue')} value={nextDue ? formatDateTime(nextDue) : t('desktop.diagnostics.scheduling.notScheduled')} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.lastReview')} value={formatDateTime(node.review?.lastReviewAt)} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.scheduledInterval')} value={node.review ? formatDurationDays(node.review.scheduledDays) : '0 d'} />
      </SchedulingSection>

      <SchedulingSection title={t('desktop.diagnostics.scheduling.decisionParameters')}>
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.priority')} value={formatPriority(priority.value)} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.priorityRatio')} value={formatNumber(data.priorityRatio)} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.priorityWeight')} value={formatPriorityWeight(priority.value, data.priorityRatio)} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.retention')} value={formatPercent(desiredRetention.value)} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.retrievability')} value={retrievability == null ? t('desktop.diagnostics.scheduling.notAvailable') : formatPercent(retrievability)} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.elapsed')} value={node.review ? formatDurationDays(node.review.elapsedDays) : '0 d'} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.stability')} value={node.review ? formatDurationDays(node.review.stability) : '0 d'} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.difficulty')} value={node.review ? formatNumber(node.review.difficulty) : '0'} />
      </SchedulingSection>

      <SchedulingSection title={t('desktop.diagnostics.scheduling.history')}>
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.reviewCount')} value={String(node.review?.reps ?? 0)} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.lapses')} value={String(node.review?.lapses ?? 0)} />
        <SchedulingInfoRow label={t('desktop.diagnostics.scheduling.lastReview')} value={formatDateTime(node.review?.lastReviewAt)} />
      </SchedulingSection>
    </div>
  );
}

function DevPanelContent({ data, t }: { data: SchedulingPanelData; t: SchedulingTranslate }) {
  if (data.kind === 'topic') {
    return <ReadingTopicContent data={data} t={t} />;
  }
  if (data.kind === 'item') {
    return <ReviewItemContent data={data} t={t} />;
  }
  return <EmptyDevPanelState t={t} />;
}

export function WorkspaceRightSidebarDevPanel(props: WorkspaceRightSidebarDevPanelProps) {
  const t = useTranslation();
  if (!props.activeNodeId) {
    return <EmptyDevPanelState t={t} />;
  }

  const data = resolveSchedulingPanelData({
    activeNodeId: props.activeNodeId,
    nodesById: props.nodesById,
    reviewSchedulerSettings: props.reviewSchedulerSettings
  });
  if (!data) {
    return null;
  }

  return <DevPanelContent data={data} t={t} />;
}
