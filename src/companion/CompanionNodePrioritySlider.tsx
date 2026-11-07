import { useEffect, useRef, useSyncExternalStore } from 'react';

import { resolveNodePrioritySetting } from '../features/nodes/model/nodeReviewSettings';
import {
  getCurrentReviewSchedulerSettings,
  subscribeReviewSchedulerSettings
} from '../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isAvailableNativeAndroidCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';

function PriorityRange(props: { value: number; disabled: boolean; onCommit(value: number): void }) {
  const t = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const { value, disabled, onCommit } = props;

  useEffect(() => {
    if (!disabled && inputRef.current) inputRef.current.value = String(value);
  }, [value, disabled]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    // Native change fires on release. Input events fire for every step of a drag.
    function commit(event: Event) {
      const next = (event.currentTarget as HTMLInputElement).valueAsNumber;
      if (!disabled && next !== value) onCommit(next);
    }
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, [value, disabled, onCommit]);

  return (
    <label className="flex min-h-11 items-center gap-3 border-b border-companion-divider py-2 text-sm">
      <span>{t('desktop.nodeReview.priority')}</span>
      <span className="text-companion-text-tertiary" aria-hidden="true">0</span>
      <input
        aria-label={t('desktop.nodeReview.priority')}
        className="min-h-11 min-w-0 flex-1 accent-companion-accent"
        defaultValue={value}
        disabled={disabled}
        max={9}
        min={0}
        onPointerCancel={event => { event.currentTarget.value = String(value); }}
        ref={inputRef}
        step={1}
        type="range"
      />
      <span className="text-companion-text-tertiary" aria-hidden="true">9</span>
    </label>
  );
}

export function CompanionNodePrioritySlider({ nodeId }: { nodeId?: string | undefined }) {
  const actions = useCompanionWorkspaceActions();
  const t = useTranslation();
  const settings = useSyncExternalStore(subscribeReviewSchedulerSettings, getCurrentReviewSchedulerSettings);
  const nodes = actions?.snapshot?.nodesById;
  const node = nodeId ? nodes?.[nodeId] : undefined;
  if (!isAvailableNativeAndroidCompanionRuntime() || !actions || actions.flowActive || !nodes || !node || node.deletedAt ||
    node.virtualFilter || node.id.startsWith('special-') || (node.kind !== 'topic' && node.kind !== 'item')) return null;
  const { value } = resolveNodePrioritySetting(node.id, nodes, settings.pushQueue.defaultPriority);

  return <>
    <PriorityRange key={node.id} value={value} disabled={actions.busy || actions.pending}
      onCommit={priority => void actions.execute({ type: 'set-priority', nodeId: node.id, priority })} />
    {actions.error && <p role="status" className="py-2 text-sm text-error">
      {t(actions.pending ? 'companion.workspace.savedRefreshError' : 'companion.reading.historyError')}
    </p>}
    {actions.pending && <button type="button" className="min-h-11 text-sm underline" disabled={actions.busy} onClick={actions.retryRefresh}>
      {t('companion.selection.refresh')}
    </button>}
  </>;
}
