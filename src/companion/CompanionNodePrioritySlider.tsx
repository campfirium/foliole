import { useEffect, useRef, useSyncExternalStore } from 'react';

import { resolveNodePrioritySetting, resolveUnenforcedNodePriority } from '../features/nodes/model/nodeReviewSettings';
import {
  getCurrentReviewSchedulerSettings,
  subscribeReviewSchedulerSettings
} from '../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';

function PriorityRange(props: { value: number; disabled: boolean; inactive: boolean; onCommit(value: number): void }) {
  const t = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const { value, disabled, onCommit } = props;

  useEffect(() => {
    if (disabled) return;
    if (inputRef.current) inputRef.current.value = String(value);
    if (valueRef.current) valueRef.current.textContent = String(value);
  }, [value, disabled]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    // Native change fires on release. Input events fire for every step of a drag.
    function commit(event: Event) {
      const next = (event.currentTarget as HTMLInputElement).valueAsNumber;
      if (disabled || next === value) return;
      if (valueRef.current) valueRef.current.textContent = String(next);
      onCommit(next);
    }
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, [value, disabled, onCommit]);

  return (
    <label className="flex min-h-11 items-center gap-3 border-b border-companion-divider py-2 text-sm data-[inactive=true]:opacity-[0.46]"
      data-inactive={props.inactive}>
      <span className="inline-flex items-center gap-1.5">
        <span>{t('desktop.nodeReview.priority')}</span>
        <span ref={valueRef} className="w-3 shrink-0 tabular-nums" aria-hidden="true">{value}</span>
      </span>
      <input
        aria-label={t('desktop.nodeReview.priority')}
        className="min-h-11 min-w-0 flex-1 accent-companion-accent"
        defaultValue={value}
        disabled={disabled}
        max={9}
        min={0}
        onInput={event => {
          if (valueRef.current) valueRef.current.textContent = event.currentTarget.value;
        }}
        onPointerCancel={event => {
          event.currentTarget.value = String(value);
          if (valueRef.current) valueRef.current.textContent = String(value);
        }}
        ref={inputRef}
        step={1}
        type="range"
      />
    </label>
  );
}

export function CompanionNodePrioritySlider({ nodeId, allowFlowTopic, onSaved }: {
  nodeId?: string | undefined; allowFlowTopic?: boolean; onSaved(): void;
}) {
  const actions = useCompanionWorkspaceActions();
  const t = useTranslation();
  const settings = useSyncExternalStore(subscribeReviewSchedulerSettings, getCurrentReviewSchedulerSettings);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const nodes = actions?.snapshot?.nodesById;
  const node = nodeId ? nodes?.[nodeId] : undefined;
  if (!isAvailableNativeCompanionRuntime() || !actions || !nodes || !node || node.deletedAt ||
    node.virtualFilter || node.id.startsWith('special-') || (node.kind !== 'topic' && node.kind !== 'item')) return null;
  if (actions.flowActive && !(allowFlowTopic && node.kind === 'topic')) return null;
  const { value } = resolveUnenforcedNodePriority(node.id, nodes, settings.pushQueue.defaultPriority);

  const effective = resolveNodePrioritySetting(node.id, nodes, settings.pushQueue.defaultPriority);
  const ownerTitle = (effective.ownerNodeId && nodes[effective.ownerNodeId]?.title) || '';

  const disabled = actions.busy || actions.pending;
  const save = (priority: number | null) => void actions.execute({ type: 'set-priority', nodeId: node.id, priority }, () => {
    if (mounted.current) onSaved();
  });

  return <>
    <PriorityRange key={node.id} value={value} inactive={effective.enforced === true} disabled={disabled} onCommit={save} />
    {node.priority != null && <button type="button" className="min-h-11 w-full border-b border-companion-divider text-left text-sm disabled:opacity-40"
      disabled={disabled} onClick={() => save(null)}>
      {t('desktop.nodeReview.inherit')}
    </button>}
    {effective.enforced && <p className="break-words py-2 text-xs">
      {`${t('desktop.nodeReview.priority.inactive')} · P${effective.value} · ${ownerTitle} `}
      {t('desktop.diagnostics.scheduling.prioritySource.enforced')}
    </p>}
    {actions.failure === 'companion.workspace.failure.priority' && <p role="status" className="py-2 text-sm text-error">
      {t(actions.pending ? 'companion.workspace.savedRefreshError' : actions.failure)}
    </p>}
    {actions.pending && <button type="button" className="min-h-11 text-sm underline" disabled={actions.busy} onClick={actions.retryRefresh}>
      {t('companion.selection.refresh')}
    </button>}
  </>;
}
