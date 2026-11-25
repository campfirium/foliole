import { useEffect, useRef, useSyncExternalStore } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { resolveNodeDesiredRetentionSetting, resolveNodeShortTermSetting } from '../features/nodes/model/nodeReviewSettings';
import {
  getCurrentReviewSchedulerSettings,
  subscribeReviewSchedulerSettings
} from '../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { CompanionMenuRow, CompanionMenuSheet } from './CompanionMenuSheet';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';

type Nodes = WorkspaceSnapshot['nodesById'];

/** A folder or topic branch whose own review options the phone may change, as the desktop Review options dialog does. */
export function canEditCompanionNodeReviewOptions(nodeId: string, nodes: Nodes) {
  const node = nodes[nodeId];
  return Boolean(node && !node.deletedAt && !node.virtualFilter && !node.id.startsWith('special-') &&
    (node.kind === 'folder' || node.kind === 'topic'));
}

/** Same rule as the desktop node menu: a folder, or a book Topic directly inside a folder. */
export function canToggleCompanionSequentialReading(nodeId: string, nodes: Nodes) {
  const node = nodes[nodeId];
  if (!canEditCompanionNodeReviewOptions(nodeId, nodes) || !node) return false;
  if (node.kind === 'folder') return true;
  return Boolean(node.parentNodeId && nodes[node.parentNodeId]?.kind === 'folder');
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

/** The branch's own desired retention and short-term steps; each choice saves at once and can return to inheriting. */
export function CompanionNodeReviewOptionsSheet({ nodeId, open, onOpenChange }: {
  nodeId: string; open: boolean; onOpenChange(open: boolean): void;
}) {
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
  const ownShortTerm = node.enableShortTerm ?? null;
  const inheritedShortTerm = resolveNodeShortTermSetting(nodeId, { ...nodes, [nodeId]: { ...node, enableShortTerm: null } }).value;
  const shortTermChoices = [
    { value: null, label: t('desktop.nodeReview.desiredRetention.useInherited'),
      status: t(inheritedShortTerm ? 'desktop.nodeReview.enabled' : 'desktop.nodeReview.disabled') },
    { value: true, label: t('desktop.nodeReview.enabled') },
    { value: false, label: t('desktop.nodeReview.disabled') }
  ] as const;

  return <CompanionMenuSheet onOpenChange={onOpenChange} open={open} title={node.title}>
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
    <section aria-label={t('desktop.nodeReview.shortTerm')}>
      <p className="pt-4 text-base font-medium">{t('desktop.nodeReview.shortTerm')}</p>
      <p className="pb-2 pt-1 text-sm text-companion-text-tertiary">{t('desktop.nodeReview.shortTerm.description')}</p>
      {shortTermChoices.map(choice => <CompanionMenuRow key={String(choice.value)} active={ownShortTerm === choice.value}
        disabled={disabled} label={choice.label} {...('status' in choice ? { status: choice.status } : {})}
        onSelect={() => actions.setReviewOption(nodeId, { enableShortTerm: choice.value })} />)}
    </section>
    {(actions.failure === 'companion.workspace.failure.reviewOptions') && <p role="status" className="py-2 text-sm text-error">
      {t(actions.pending ? 'companion.workspace.savedRefreshError' : actions.failure)}
    </p>}
  </CompanionMenuSheet>;
}
