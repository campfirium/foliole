import type { ReactNode } from 'react';

import type { Node, NodeReadingProfile } from '../../features/nodes/model/nodeTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';

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
      <dt className="text-foreground/55">{label}</dt>
      <dd className="min-w-0 text-right text-foreground">{value}</dd>
    </>
  );
}

function SchedulingSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="border-t border-border/70 py-3 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground/50">{title}</h3>
      <dl className="grid grid-cols-[minmax(92px,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">{children}</dl>
    </section>
  );
}

function ReadingProfileSection({ reading }: { reading: NodeReadingProfile | null | undefined }) {
  if (!reading) {
    return (
      <SchedulingSection title="History">
        <SchedulingInfoRow label="Last handled" value="None" />
        <SchedulingInfoRow label="Read count" value="0" />
      </SchedulingSection>
    );
  }

  return (
    <SchedulingSection title="History">
      <SchedulingInfoRow label="Last handled" value={formatDateTime(reading.lastHandledAt)} />
      <SchedulingInfoRow label="Read count" value={String(reading.repetitionCount)} />
    </SchedulingSection>
  );
}

function EmptyDevPanelState() {
  return (
    <section className="py-3">
      <h3 className="text-sm font-semibold text-foreground">Scheduling</h3>
      <p className="mt-1 text-sm text-foreground/65">Select a topic to inspect its scheduling state.</p>
    </section>
  );
}

function ReadingTopicContent({ data }: { data: SchedulingPanelData }) {
  const { node, priority } = data;
  const currentInterval = node.reading?.intervalDurationMs ?? data.initialReadingIntervalMs;
  const previousInterval = node.reading && node.reading.repetitionCount > 1
    ? node.reading.intervalDurationMs / node.reading.intervalGrowthFactor
    : null;

  return (
    <div className="flex min-h-0 flex-col">
      <SchedulingHeader subtitle="Topic" />
      <SchedulingSection title="Schedule">
        <SchedulingInfoRow label="Next scheduled" value={formatDateTime(data.nextReadingAt)} />
        <SchedulingInfoRow label="Initial interval" value={formatDurationMs(data.initialReadingIntervalMs)} />
        <SchedulingInfoRow label="Current interval" value={formatDurationMs(currentInterval)} />
        <SchedulingInfoRow label="Previous interval" value={previousInterval ? formatDurationMs(previousInterval) : 'None'} />
      </SchedulingSection>
      <SchedulingSection title="Decision parameters">
        <SchedulingInfoRow label="Priority" value={formatPriority(priority.value)} />
        <SchedulingInfoRow label="Priority ratio" value={formatNumber(data.priorityRatio)} />
        <SchedulingInfoRow label="Priority weight" value={formatPriorityWeight(priority.value, data.priorityRatio)} />
        <SchedulingInfoRow label="Growth factor" value={formatNumber(data.readingGrowthFactor)} />
      </SchedulingSection>
      <ReadingProfileSection reading={node.reading} />
    </div>
  );
}

function SchedulingHeader({ subtitle }: { subtitle: string }) {
  return (
    <section className="pb-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">Scheduling</h3>
        <p className="mt-1 text-sm text-foreground/65">{subtitle}</p>
      </div>
    </section>
  );
}

function ReviewItemContent({ data }: { data: SchedulingPanelData }) {
  const { desiredRetention, node, priority, retrievability } = data;
  const nextDue = node.review?.due ?? '';

  return (
    <div className="flex min-h-0 flex-col">
      <SchedulingHeader subtitle="Item" />

      <SchedulingSection title="Schedule">
        <SchedulingInfoRow label="Next due" value={nextDue ? formatDateTime(nextDue) : 'Not scheduled'} />
        <SchedulingInfoRow label="Last review" value={formatDateTime(node.review?.lastReviewAt)} />
        <SchedulingInfoRow label="Scheduled interval" value={node.review ? formatDurationDays(node.review.scheduledDays) : '0 d'} />
      </SchedulingSection>

      <SchedulingSection title="Decision parameters">
        <SchedulingInfoRow label="Priority" value={formatPriority(priority.value)} />
        <SchedulingInfoRow label="Priority ratio" value={formatNumber(data.priorityRatio)} />
        <SchedulingInfoRow label="Priority weight" value={formatPriorityWeight(priority.value, data.priorityRatio)} />
        <SchedulingInfoRow label="Retention" value={formatPercent(desiredRetention.value)} />
        <SchedulingInfoRow label="Retrievability" value={retrievability == null ? 'Not available' : formatPercent(retrievability)} />
        <SchedulingInfoRow label="Elapsed" value={node.review ? formatDurationDays(node.review.elapsedDays) : '0 d'} />
        <SchedulingInfoRow label="Stability" value={node.review ? formatDurationDays(node.review.stability) : '0 d'} />
        <SchedulingInfoRow label="Difficulty" value={node.review ? formatNumber(node.review.difficulty) : '0'} />
      </SchedulingSection>

      <SchedulingSection title="History">
        <SchedulingInfoRow label="Review count" value={String(node.review?.reps ?? 0)} />
        <SchedulingInfoRow label="Lapses" value={String(node.review?.lapses ?? 0)} />
        <SchedulingInfoRow label="Last review" value={formatDateTime(node.review?.lastReviewAt)} />
      </SchedulingSection>
    </div>
  );
}

function DevPanelContent({ data }: { data: SchedulingPanelData }) {
  if (data.kind === 'topic') {
    return <ReadingTopicContent data={data} />;
  }
  if (data.kind === 'item') {
    return <ReviewItemContent data={data} />;
  }
  return <EmptyDevPanelState />;
}

export function WorkspaceRightSidebarDevPanel(props: WorkspaceRightSidebarDevPanelProps) {
  if (!props.activeNodeId) {
    return <EmptyDevPanelState />;
  }

  const data = resolveSchedulingPanelData({
    activeNodeId: props.activeNodeId,
    nodesById: props.nodesById,
    reviewSchedulerSettings: props.reviewSchedulerSettings
  });
  if (!data) {
    return null;
  }

  return <DevPanelContent data={data} />;
}
