import { useState } from 'react';

import { NodeReviewSchedulingDialog } from '../../features/nodes/components/NodeReviewSchedulingDialog';
import type { ResolvedNodePriority } from '../../features/nodes/model/nodeReviewSettings';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useWorkspaceStore } from '../../store/workspaceStore';

interface SchedulingPrioritySourceProps {
  clickable?: boolean;
  priority: ResolvedNodePriority;
  nodesById: Record<string, Node>;
  settings: ReviewSchedulerSettings;
}

export function SchedulingPrioritySource({ clickable = true, priority, nodesById, settings }: SchedulingPrioritySourceProps) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const updatePriority = useWorkspaceStore(state => state.updateNodePriority);
  const updateRetention = useWorkspaceStore(state => state.updateNodeDesiredRetention);
  const updateShortTerm = useWorkspaceStore(state => state.updateNodeShortTerm);
  const owner = priority.source === 'inherited' && priority.ownerNodeId ? nodesById[priority.ownerNodeId] : undefined;

  if (priority.source === 'explicit') return t('desktop.diagnostics.scheduling.prioritySource.own');
  if (priority.source === 'default') return t('desktop.diagnostics.scheduling.prioritySource.default');

  return (
    <>
      {owner && (clickable ? (
        <button className="cursor-pointer underline decoration-foreground/40 underline-offset-2 hover:decoration-current"
          onClick={() => setOpen(true)} type="button">
          {owner.title}
        </button>
      ) : owner.title)}
      {owner ? ' ' : null}<span>{t(priority.enforced
        ? 'desktop.diagnostics.scheduling.prioritySource.enforced'
        : 'desktop.diagnostics.scheduling.prioritySource.inherited')}</span>
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
