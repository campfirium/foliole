import { forgetting_curve } from 'ts-fsrs';

import {
  resolveNodeDesiredRetentionSetting,
  resolveNodePrioritySetting,
  type ResolvedNodeSetting
} from '../../features/nodes/model/nodeReviewSettings';
import type { Node, NodeReadingProfile, NodeReviewProfile } from '../../features/nodes/model/nodeTypes';
import { isFsrsReviewItemNode } from '../../features/review/model/reviewItemKind';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import { InspectorSection } from '../../shared/ui';

interface WorkspaceRightSidebarDevPanelProps {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  reviewSchedulerSettings: ReviewSchedulerSettings;
}

interface DevPanelResolvedData {
  desiredRetention: ResolvedNodeSetting<number>;
  node: Node;
  priority: ResolvedNodeSetting<number>;
  retrievability: number | null;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'None';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function getReviewStateLabel(state: NodeReviewProfile['state']) {
  if (state === 0) {
    return 'New';
  }
  if (state === 1) {
    return 'Learning';
  }
  if (state === 2) {
    return 'Review';
  }
  return 'Relearning';
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function getSettingSourceLabel(setting: ResolvedNodeSetting<number>) {
  if (setting.source === 'explicit') {
    return 'Explicit';
  }
  if (setting.source === 'inherited') {
    return 'Inherited';
  }
  return 'Default';
}

function formatDurationDays(value: number) {
  return `${formatNumber(value)} d`;
}

function getDueStatusLabel(due: string | null | undefined, now: number) {
  if (!due) {
    return 'Unknown';
  }
  const dueMs = Date.parse(due);
  if (Number.isNaN(dueMs)) {
    return 'Invalid timestamp';
  }
  return dueMs <= now ? 'Due now' : 'Scheduled';
}

function getFsrsRetrievability(review: NodeReviewProfile | null, now: number) {
  if (!review?.lastReviewAt || review.stability <= 0) {
    return null;
  }
  const lastReviewMs = Date.parse(review.lastReviewAt);
  if (Number.isNaN(lastReviewMs)) {
    return null;
  }
  const elapsedDays = Math.max((now - lastReviewMs) / (24 * 60 * 60 * 1000), 0);
  const retrievability = forgetting_curve(elapsedDays, review.stability);
  return Number.isFinite(retrievability) ? retrievability : null;
}

function DevInfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-foreground/55">{label}</dt>
      <dd className={`min-w-0 break-all text-right text-foreground ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</dd>
    </>
  );
}

function ReadingProfileSection({ reading }: { reading: NodeReadingProfile | null | undefined }) {
  if (!reading) {
    return null;
  }
  const intervalDays = Math.round(reading.intervalDurationMs / (24 * 60 * 60 * 1000));

  return (
    <InspectorSection contentClassName="grid grid-cols-[minmax(88px,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]" title="Reading">
      <dl className="contents">
        <DevInfoRow label="Next at" value={formatDateTime(reading.nextAt)} />
        <DevInfoRow label="Last handled" value={formatDateTime(reading.lastHandledAt)} />
        <DevInfoRow label="Interval" value={`${intervalDays} d`} />
        <DevInfoRow label="Growth" value={formatNumber(reading.intervalGrowthFactor)} />
        <DevInfoRow label="Position" value={String(reading.readingPosition)} />
        <DevInfoRow label="Repeats" value={String(reading.repetitionCount)} />
      </dl>
    </InspectorSection>
  );
}

function EmptyDevPanelState() {
  return <InspectorSection description="Select a node to inspect its development data." title="Dev panel" />;
}

function resolveDevPanelData(
  activeNodeId: string,
  nodesById: Record<string, Node>,
  reviewSchedulerSettings: ReviewSchedulerSettings
): DevPanelResolvedData | null {
  const node = nodesById[activeNodeId];
  if (!node) {
    return null;
  }
  const now = Date.now();
  return {
    desiredRetention: resolveNodeDesiredRetentionSetting(
      activeNodeId,
      nodesById,
      reviewSchedulerSettings.desiredRetention
    ),
    node,
    priority: resolveNodePrioritySetting(
      activeNodeId,
      nodesById,
      reviewSchedulerSettings.pushQueue.defaultPriority
    ),
    retrievability: getFsrsRetrievability(node.review, now)
  };
}

function DevPanelContent({ data }: { data: DevPanelResolvedData }) {
  const now = Date.now();
  const { desiredRetention, node, priority, retrievability } = data;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <InspectorSection contentClassName="grid grid-cols-[minmax(88px,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]" title="Scheduling">
        <dl className="contents">
          <DevInfoRow label="Priority" value={`P${priority.value} · ${getSettingSourceLabel(priority)}`} />
          <DevInfoRow
            label="Retention"
            value={`${formatPercent(desiredRetention.value)} · ${getSettingSourceLabel(desiredRetention)}`}
          />
          <DevInfoRow label="Due status" value={getDueStatusLabel(node.review?.due, now)} />
          <DevInfoRow
            label="Retrievability"
            value={retrievability == null ? 'Not available' : formatPercent(retrievability)}
          />
          <DevInfoRow label="Last review" value={formatDateTime(node.review?.lastReviewAt)} />
          <DevInfoRow label="Next due" value={formatDateTime(node.review?.due)} />
        </dl>
      </InspectorSection>

      <InspectorSection contentClassName="grid grid-cols-[minmax(88px,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]" title="Review">
        <dl className="contents">
          <DevInfoRow label="State" value={node.review ? getReviewStateLabel(node.review.state) : 'Not initialized'} />
          <DevInfoRow label="Stability" value={node.review ? formatDurationDays(node.review.stability) : '0 d'} />
          <DevInfoRow label="Difficulty" value={node.review ? formatNumber(node.review.difficulty) : '0'} />
          <DevInfoRow label="Elapsed" value={node.review ? formatDurationDays(node.review.elapsedDays) : '0 d'} />
          <DevInfoRow label="Scheduled" value={node.review ? formatDurationDays(node.review.scheduledDays) : '0 d'} />
          <DevInfoRow label="Reps" value={String(node.review?.reps ?? 0)} />
          <DevInfoRow label="Lapses" value={String(node.review?.lapses ?? 0)} />
        </dl>
      </InspectorSection>

      <ReadingProfileSection reading={node.reading} />

      <InspectorSection contentClassName="grid grid-cols-[minmax(88px,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]" title="Node">
        <dl className="contents">
          <DevInfoRow label="Parent" value={node.parentNodeId ?? 'Root'} mono={node.parentNodeId !== null} />
          <DevInfoRow label="Created" value={formatDateTime(node.createdAt)} />
          <DevInfoRow label="Updated" value={formatDateTime(node.updatedAt)} />
          <DevInfoRow label="Kind" value={isFsrsReviewItemNode(node) ? 'Review' : 'Reading'} />
          <DevInfoRow label="Anchor kind" value={node.anchorLink?.kind ?? 'None'} />
          <DevInfoRow label="Content size" value={`${node.content.length} chars`} />
        </dl>
      </InspectorSection>
    </div>
  );
}

export function WorkspaceRightSidebarDevPanel(props: WorkspaceRightSidebarDevPanelProps) {
  if (!props.activeNodeId) {
    return <EmptyDevPanelState />;
  }

  const data = resolveDevPanelData(props.activeNodeId, props.nodesById, props.reviewSchedulerSettings);
  if (!data) {
    return null;
  }

  return <DevPanelContent data={data} />;
}
