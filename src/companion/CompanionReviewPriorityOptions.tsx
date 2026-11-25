import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { resolveNodePrioritySetting, resolveUnenforcedNodePriority } from '../features/nodes/model/nodeReviewSettings';
import { normalizePushQueuePriority } from '../features/review/model/unifiedPushQueueRules';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { settingsSwitchClassName, settingsSwitchKnobClassName } from '../shared/ui';
import type { WorkspaceMetadataCommand } from '../store/workspaceNodeMetadataMutation';

import { CompanionPriorityControl } from './CompanionPriorityControl';

interface CompanionReviewPriorityOptionsProps {
  defaultPriority: number;
  disabled: boolean;
  node: WorkspaceNodeSnapshot;
  nodes: Record<string, WorkspaceNodeSnapshot>;
  onCommit(command: Extract<WorkspaceMetadataCommand, { type: 'set-priority' }>): void;
}

export function CompanionReviewPriorityOptions({ defaultPriority, disabled, node, nodes, onCommit }: CompanionReviewPriorityOptionsProps) {
  const t = useTranslation();
  const fallback = normalizePushQueuePriority(defaultPriority);
  const setting = resolveUnenforcedNodePriority(node.id, nodes, fallback);
  const effective = resolveNodePrioritySetting(node.id, nodes, fallback);
  const ownerTitle = effective.ownerNodeId ? nodes[effective.ownerNodeId]?.title ?? '' : '';
  const enforcing = node.enforcePriority === true;
  const enforceLabel = t('desktop.nodeReview.priority.enforce');
  return (
    <>
      <CompanionPriorityControl disabled={disabled} ownPriority={node.priority ?? null} value={setting.value}
        enforced={effective.enforced && !enforcing ? { value: effective.value, owner: ownerTitle } : undefined}
        onCommit={priority => onCommit({ type: 'set-priority', nodeId: node.id, priority })} />
      {node.kind === 'folder' && <section className="flex items-center justify-between gap-4 border-b border-companion-divider py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{enforceLabel}</p>
          <p className="mt-1 text-xs text-companion-text-secondary">{t('desktop.nodeReview.priority.enforce.description')}</p>
        </div>
        <button aria-checked={enforcing} aria-label={enforceLabel} className="grid min-h-11 min-w-11 shrink-0 place-items-center"
          disabled={disabled} role="switch" type="button"
          onClick={() => onCommit({ type: 'set-priority', nodeId: node.id, priority: setting.value, enforcePriority: !enforcing })}>
          <span className={settingsSwitchClassName(enforcing)}>
            <span className={settingsSwitchKnobClassName(enforcing)} />
          </span>
        </button>
      </section>}
    </>
  );
}
