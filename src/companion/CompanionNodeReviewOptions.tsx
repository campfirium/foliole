import { useEffect, useRef, useSyncExternalStore } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { resolveNodeDesiredRetentionSetting, resolveNodeShortTermSetting } from '../features/nodes/model/nodeReviewSettings';
import {
  getCurrentReviewSchedulerSettings,
  subscribeReviewSchedulerSettings
} from '../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { settingsSwitchClassName, settingsSwitchKnobClassName } from '../shared/ui';

import { CompanionBottomSheet } from './CompanionBottomSheet';
import { CompanionMenuRow } from './CompanionMenuSheet';
import { CompanionReviewPriorityOptions } from './CompanionReviewPriorityOptions';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';

type Nodes = WorkspaceSnapshot['nodesById'];

/** A material whose own review options the phone may change. */
export function canEditCompanionNodeReviewOptions(nodeId: string, nodes: Nodes) {
  const node = nodes[nodeId];
  return Boolean(node && !node.deletedAt && !node.virtualFilter && !node.id.startsWith('special-') &&
    (node.kind === 'folder' || node.kind === 'topic' || node.kind === 'item'));
}

/** Same rule as the desktop node menu: a folder, or a book Topic directly inside a folder. */
export function canToggleCompanionSequentialReading(nodeId: string, nodes: Nodes) {
  const node = nodes[nodeId];
  if (!canEditCompanionNodeReviewOptions(nodeId, nodes) || !node) return false;
  if (node.kind === 'folder') return true;
  return Boolean(node.kind === 'topic' && node.parentNodeId && nodes[node.parentNodeId]?.kind === 'folder');
}

/** Long-press rows for a folder or book: toggle Sequential Reading and open its Review options. */
export function CompanionNodeReviewMenuRows({ nodeId, onOpenOptions, onSaved }: {
  nodeId: string; onOpenOptions(): void; onSaved(): void;
}) {
  const actions = useCompanionWorkspaceActions();
  const t = useTranslation();
  const nodes = actions?.snapshot?.nodesById;
  if (!isAvailableNativeCompanionRuntime() || !actions || !nodes || !canEditCompanionNodeReviewOptions(nodeId, nodes)) return null;
  const disabled = actions.busy || actions.pending;
  const enabled = nodes[nodeId]?.sequentialReadingEnabled === true;
  return <>
    {canToggleCompanionSequentialReading(nodeId, nodes) && <CompanionMenuRow disabled={disabled}
      label={t(enabled ? 'desktop.nodeList.menu.disableSequentialReading' : 'desktop.nodeList.menu.enableSequentialReading')}
      onSelect={() => actions.setSequentialReading(nodeId, !enabled, onSaved)} />}
    <CompanionMenuRow disabled={disabled} label={t('desktop.nodeReview.title')} onSelect={onOpenOptions} />
  </>;
}

function RetentionRange(props: { percent: number; disabled: boolean; onCommit(percent: number): void }) {
  const t = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const { percent, disabled, onCommit } = props;

  useEffect(() => {
    if (inputRef.current) inputRef.current.value = String(percent);
    if (valueRef.current) valueRef.current.textContent = `${percent}%`;
  }, [percent]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    // Native change fires on release; input events fire for every step of a drag.
    function commit(event: Event) {
      const next = (event.currentTarget as HTMLInputElement).valueAsNumber;
      if (disabled || next === percent) return;
      onCommit(next);
    }
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, [percent, disabled, onCommit]);

  return <span className="flex min-w-0 flex-1 items-center gap-3">
    <input aria-label={t('desktop.nodeReview.desiredRetention.aria')} className="min-h-11 min-w-0 flex-1 accent-companion-accent"
      defaultValue={percent} disabled={disabled} max={99} min={1} ref={inputRef} step={1} type="range"
      onInput={event => { if (valueRef.current) valueRef.current.textContent = `${event.currentTarget.value}%`; }} />
    <span ref={valueRef} aria-hidden="true" className="w-10 shrink-0 text-right tabular-nums">{percent}%</span>
  </span>;
}

export function CompanionNodeReviewOptionsSheet({ nodeId, open, onOpenChange }: {
  nodeId: string; open: boolean; onOpenChange(open: boolean): void;
}) {
  const t = useTranslation();
  const nodes = useCompanionWorkspaceActions()?.snapshot?.nodesById;
  const node = nodes?.[nodeId];
  if (!nodes || !node || !canEditCompanionNodeReviewOptions(nodeId, nodes)) return null;
  return <CompanionBottomSheet onOpenChange={onOpenChange} open={open} title={t('desktop.nodeReview.title')}>
    <CompanionNodeReviewOptionsContent nodeId={nodeId} />
  </CompanionBottomSheet>;
}

export function CompanionNodeReviewOptionsContent({ nodeId }: { nodeId: string }) {
  const actions = useCompanionWorkspaceActions();
  const t = useTranslation();
  const settings = useSyncExternalStore(subscribeReviewSchedulerSettings, getCurrentReviewSchedulerSettings);
  const nodes = actions?.snapshot?.nodesById;
  const node = nodes?.[nodeId];
  if (!actions || !nodes || !node || !canEditCompanionNodeReviewOptions(nodeId, nodes)) return null;
  const disabled = actions.busy || actions.pending;
  const ownRetention = node.desiredRetention ?? null;
  const inheritedRetention = resolveNodeDesiredRetentionSetting(nodeId, { ...nodes, [nodeId]: { ...node, desiredRetention: null } },
    settings.desiredRetention).value;
  const percent = Math.round((ownRetention ?? inheritedRetention) * 100);
  const retentionLabel = t('desktop.nodeReview.desiredRetention');
  const shortTerm = resolveNodeShortTermSetting(nodeId, nodes).value;
  const shortTermLabel = t('desktop.nodeReview.shortTerm');

  return <>
    <section aria-label={retentionLabel} className="border-b border-companion-divider py-3">
      <div className="flex min-h-11 items-center justify-between gap-3 text-base font-medium">
        <span>{ownRetention === null ? t('desktop.nodeReview.desiredRetention.inherited', { label: retentionLabel }) : retentionLabel}</span>
        {ownRetention !== null && <button className="min-h-11 text-sm font-normal underline" disabled={disabled} type="button"
          onClick={() => actions.setReviewOption(nodeId, { desiredRetention: null })}>
          {t('desktop.nodeReview.desiredRetention.useInherited')}
        </button>}
      </div>
      <RetentionRange disabled={disabled} percent={percent}
        onCommit={next => actions.setReviewOption(nodeId, { desiredRetention: next / 100 })} />
    </section>
    <CompanionReviewPriorityOptions key={nodeId} defaultPriority={settings.pushQueue.defaultPriority}
      disabled={disabled} node={node} nodes={nodes} onCommit={command => void actions.execute(command)} />
    <section className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{shortTermLabel}</p>
        <p className="mt-1 text-xs text-companion-text-secondary">{t('desktop.nodeReview.shortTerm.description')}</p>
      </div>
      <button aria-checked={shortTerm} aria-label={shortTermLabel} className="grid min-h-11 min-w-11 shrink-0 place-items-center"
        disabled={disabled} role="switch" type="button"
        onClick={() => actions.setReviewOption(nodeId, { enableShortTerm: !shortTerm })}>
        <span className={settingsSwitchClassName(shortTerm)}><span className={settingsSwitchKnobClassName(shortTerm)} /></span>
      </button>
    </section>
    {(actions.failure === 'companion.workspace.failure.reviewOptions' || actions.failure === 'companion.workspace.failure.priority') && <p role="status" className="py-2 text-sm text-error">
      {t(actions.pending ? 'companion.workspace.savedRefreshError' : actions.failure)}
    </p>}
    {actions.pending && <button type="button" className="min-h-11 text-sm underline" disabled={actions.busy} onClick={actions.retryRefresh}>
      {t('companion.selection.refresh')}
    </button>}
  </>;
}
