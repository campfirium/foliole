import { useState } from 'react';

import { NodeReviewSchedulingDialog } from '../../features/nodes/components/NodeReviewSchedulingDialog';
import { PrioritySourceTooltip } from '../../features/nodes/components/PrioritySourceTooltip';
import type { ResolvedNodePriority } from '../../features/nodes/model/nodeReviewSettings';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useWorkspaceStore } from '../../store/workspaceStore';

interface SchedulingPrioritySourceProps {
  ownPriority: number | null | undefined;
  priority: ResolvedNodePriority;
  nodesById: Record<string, Node>;
  settings: ReviewSchedulerSettings;
}

export function SchedulingPrioritySource({ ownPriority, priority, nodesById, settings }: SchedulingPrioritySourceProps) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const updatePriority = useWorkspaceStore(state => state.updateNodePriority);
  const updateRetention = useWorkspaceStore(state => state.updateNodeDesiredRetention);
  const updateShortTerm = useWorkspaceStore(state => state.updateNodeShortTerm);
  const owner = priority.source === 'inherited' && priority.ownerNodeId ? nodesById[priority.ownerNodeId] : undefined;

  const effective = `P${priority.value}`;
  if (priority.source === 'explicit') return <span className="font-semibold">{effective}</span>;

  return (
    <>
      <span className="inline-flex items-center justify-end gap-1 whitespace-nowrap">
        {priority.enforced && ownPriority != null && <span className="text-foreground/52">P{ownPriority}</span>}
        <PrioritySourceTooltip accessibleLabel={t('desktop.diagnostics.scheduling.prioritySource')}
          className="inline-grid size-5 cursor-pointer place-items-center rounded-sm bg-transparent text-foreground/64"
          source={owner ? (dismiss) => <>
            <button className="max-w-full cursor-pointer text-left [overflow-wrap:anywhere] underline decoration-foreground/40 underline-offset-2 hover:decoration-current"
              onClick={() => {
                dismiss();
                setOpen(true);
              }} type="button">
              {owner.title}
            </button>{' '}
            {t(priority.enforced ? 'desktop.diagnostics.scheduling.prioritySource.enforced'
              : 'desktop.diagnostics.scheduling.prioritySource.inherited')}
          </> : t('desktop.diagnostics.scheduling.prioritySource.default')}>
          <PriorityChevron enforced={priority.enforced === true} />
        </PrioritySourceTooltip>
        <span className="font-semibold">{effective}</span>
      </span>
      {open && owner && (
        <NodeReviewSchedulingDialog
          defaultDesiredRetention={settings.desiredRetention}
          defaultPriority={settings.pushQueue.defaultPriority}
          node={owner}
          nodesById={nodesById}
          onClose={() => setOpen(false)}
          onDesiredRetentionChange={updateRetention}
          onPriorityChange={updatePriority}
          onShortTermChange={updateShortTerm}
          titleQualifier={owner.title}
        />
      )}
    </>
  );
}

function PriorityChevron({ enforced }: { enforced: boolean }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d={enforced ? 'm3 4 4 4-4 4m5-8 4 4-4 4' : 'm6 4 4 4-4 4'} />
    </svg>
  );
}
