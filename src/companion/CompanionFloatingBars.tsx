import type { ComponentType } from 'react';

import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';

import {
  resolveCompanionTabs,
  type CompanionResolvedTab,
  type CompanionSecondaryDestinationId,
  type CompanionTabAction,
  type CompanionTabConfig
} from './CompanionTabsConfig';

export type { CompanionTabAction } from './CompanionTabsConfig';
export type BottomBarGrade = 1 | 2 | 3 | 4;

function formatSyncPhase(progress: CompanionDesktopSyncProgress) {
  if (progress.phase === 'structure') {
    return 'Stage 1 · Library index';
  }
  if (isActiveTopicProgress(progress)) {
    return 'Current topic';
  }
  if (isReviewQueueProgress(progress)) {
    return 'Stage 2 · Review queue';
  }
  if (progress.phase === 'attachment') {
    return 'Stage 4 · Attachments';
  }
  return 'Stage 3 · Topic bodies';
}

function formatCountLabel(count: number | undefined, singular: string, plural: string) {
  const value = count ?? 0;
  return `${value} ${value === 1 ? singular : plural}`;
}

function reviewQueueTotal(progress: CompanionDesktopSyncProgress) {
  if (progress.phase === 'content') {
    return progress.contentBreakdown?.dueReviewBodies ?? 0;
  }
  if (progress.phase === 'attachment') {
    return progress.attachmentBreakdown?.dueReviewAttachments ?? 0;
  }
  return 0;
}

function activeTopicTotal(progress: CompanionDesktopSyncProgress) {
  if (progress.phase === 'content') {
    return progress.contentBreakdown?.activeTopicBodies ?? 0;
  }
  if (progress.phase === 'attachment') {
    return progress.attachmentBreakdown?.activeTopicAttachments ?? 0;
  }
  return 0;
}

function isActiveTopicProgress(progress: CompanionDesktopSyncProgress) {
  const total = activeTopicTotal(progress);
  return total > 0 && progress.completed < total;
}

function isReviewQueueProgress(progress: CompanionDesktopSyncProgress) {
  const total = reviewQueueTotal(progress);
  return total > 0 && progress.completed < total;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

function formatContentBreakdown(progress: CompanionDesktopSyncProgress) {
  if (progress.phase !== 'content' || !progress.contentBreakdown) {
    return null;
  }
  const breakdown = progress.contentBreakdown;
  if (isActiveTopicProgress(progress)) {
    return `Current topic: ${formatCountLabel(breakdown.activeTopicBodies, 'body', 'bodies')}`;
  }
  if (isReviewQueueProgress(progress)) {
    return `Review queue: ${formatCountLabel(breakdown.dueReviewBodies, 'body', 'bodies')}`;
  }
  const segments = [
    ['Top-level', breakdown.topLevelTopicBodies],
    ['Nested', breakdown.nestedTopicBodies],
    ['External', breakdown.externalDocumentBodies],
    ['Review queue', breakdown.dueReviewBodies]
  ]
    .filter((segment): segment is [string, number] => typeof segment[1] === 'number')
    .map(([label, count]) => `${label} ${count}`);
  return segments.length > 0 ? segments.join(' · ') : null;
}

function formatAttachmentBreakdown(progress: CompanionDesktopSyncProgress) {
  if (progress.phase !== 'attachment' || !progress.attachmentBreakdown) {
    return null;
  }
  const breakdown = progress.attachmentBreakdown;
  if (isActiveTopicProgress(progress)) {
    return `Current topic: ${formatCountLabel(breakdown.activeTopicAttachments, 'attachment', 'attachments')}`;
  }
  if (isReviewQueueProgress(progress)) {
    return `Review queue: ${formatCountLabel(breakdown.dueReviewAttachments, 'attachment', 'attachments')}`;
  }
  const segments = [
    ['Images', breakdown.imageAttachments],
    ['PDFs', breakdown.pdfAttachments],
    ['Other', breakdown.otherAttachments]
  ]
    .filter((segment): segment is [string, number] => typeof segment[1] === 'number')
    .map(([label, count]) => `${label} ${count}`);
  return segments.length > 0 ? segments.join(' · ') : null;
}

function formatProgressCount(args: {
  completed: number;
  isReviewQueue: boolean;
  progress: CompanionDesktopSyncProgress;
  total: number;
}) {
  if (args.progress.total === null) {
    return 'Checking';
  }
  return `${args.completed}/${args.total}`;
}

function CompanionBottomSyncStatus(props: {
  progress: CompanionDesktopSyncProgress | null;
}) {
  if (!props.progress) {
    return null;
  }
  const activeTotal = activeTopicTotal(props.progress);
  const fsrsTotal = reviewQueueTotal(props.progress);
  const isReviewQueue = isReviewQueueProgress(props.progress);
  const isActiveTopic = isActiveTopicProgress(props.progress);
  const total = isActiveTopic ? activeTotal : isReviewQueue ? fsrsTotal : props.progress.total ?? 0;
  const completed = Math.min(props.progress.completed, total);
  const ratio = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const countLabel = formatProgressCount({ completed, isReviewQueue, progress: props.progress, total });
  const byteLabel = isActiveTopic || isReviewQueue || props.progress.totalBytes == null || props.progress.completedBytes == null
    ? null
    : `${formatBytes(props.progress.completedBytes)}/${formatBytes(props.progress.totalBytes)}`;
  const contentBreakdown = formatContentBreakdown(props.progress);
  const attachmentBreakdown = formatAttachmentBreakdown(props.progress);
  const detailBreakdown = contentBreakdown ?? attachmentBreakdown;
  return (
    <section
      aria-label="Sync progress"
      className="mx-auto mb-2 w-full max-w-[760px] rounded-md border border-companion-divider bg-companion-subtle px-3 py-2 text-xs leading-5 text-companion-text-secondary"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-foreground">{formatSyncPhase(props.progress)}</span>
        <span className="shrink-0 tabular-nums">{byteLabel ? `${countLabel} - ${byteLabel}` : countLabel}</span>
      </div>
      {detailBreakdown ? <div className="mt-0.5 truncate text-companion-text-secondary">{detailBreakdown}</div> : null}
      {props.progress.total === null ? null : (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-companion-divider">
          <div className="h-full rounded-full bg-companion-accent" style={{ width: `${ratio}%` }} />
        </div>
      )}
    </section>
  );
}

function TabButton(props: {
  active?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
}) {
  const Icon = props.icon;
  return (
    <button
      aria-current={props.active ? 'page' : undefined}
      aria-label={props.label}
      className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors ${
        props.active ? 'bg-companion-accent-soft text-companion-accent' : 'text-companion-text-secondary'
      }`}
      onClick={props.onClick}
      type="button"
    >
      <Icon className="h-5 w-5" />
      <span className="max-w-full truncate">{props.label}</span>
    </button>
  );
}

export function CompanionBottomTabBar(props: {
  activeAction: CompanionTabAction;
  activeSecondaryDestinationId: CompanionSecondaryDestinationId | null;
  config: CompanionTabConfig;
  onAction(action: CompanionTabAction): void;
  onSecondaryDestination(destinationId: CompanionSecondaryDestinationId): void;
  syncProgress?: CompanionDesktopSyncProgress | null;
  visible: boolean;
}) {
  if (!props.visible) {
    return null;
  }

  return (
    <footer
      className="fixed inset-x-0 bottom-0 z-20 border-t border-companion-divider bg-companion-content px-4 pb-5 pt-2 shadow-panel"
      data-testid="companion-bottom-tab-bar"
    >
      <CompanionBottomSyncStatus progress={props.syncProgress ?? null} />
      <div className="mx-auto flex w-full max-w-[760px] items-center gap-1">
        {renderTabButtons(resolveCompanionTabs(props.config), props)}
      </div>
    </footer>
  );
}

function renderTabButtons(
  tabs: CompanionResolvedTab[],
  props: Pick<
    Parameters<typeof CompanionBottomTabBar>[0],
    'activeAction' | 'activeSecondaryDestinationId' | 'onAction' | 'onSecondaryDestination'
  >
) {
  const isShortcutActive = tabs.some(
    (tab) => tab.id === 'shortcut' && tab.destinationId === props.activeSecondaryDestinationId
  );
  return tabs.map((tab) => renderTabButton(tab, props, isShortcutActive));
}

function renderTabButton(
  tab: CompanionResolvedTab,
  props: Pick<
    Parameters<typeof CompanionBottomTabBar>[0],
    'activeAction' | 'activeSecondaryDestinationId' | 'onAction' | 'onSecondaryDestination'
  >,
  isShortcutActive: boolean
) {
  const isShortcut = tab.id === 'shortcut' && Boolean(tab.destinationId);
  const isActive = isShortcut
    ? props.activeSecondaryDestinationId === tab.destinationId
    : props.activeAction === tab.action && !isShortcutActive;
  return (
    <TabButton
      active={isActive}
      icon={tab.icon}
      key={tab.id}
      label={tab.label}
      onClick={() => {
        if (tab.destinationId) props.onSecondaryDestination(tab.destinationId);
        else if (tab.action) props.onAction(tab.action);
      }}
    />
  );
}
