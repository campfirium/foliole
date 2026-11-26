import { CalendarClock, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

import { getReviewItemKind } from '../features/review/model/reviewItemKind';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { canEditCompanionNodeReviewOptions, CompanionNodeReviewOptionsSheet } from './CompanionNodeReviewOptions';
import { CompanionSchedulingSheet } from './CompanionSchedulingSheet';
import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';
import { CompanionWorkspaceIconRow } from './CompanionWorkspaceMenuActions';

export function useReadingReviewNavigation(nodeId: string | undefined, closeActions: () => void) {
  const t = useTranslation();
  const workspace = useCompanionWorkspaceActions();
  const [view, setView] = useState<'options' | 'scheduling' | null>(null);
  const nodes = workspace?.snapshot?.nodesById;
  if (!nodeId || !nodes || !isAvailableNativeCompanionRuntime() || !canEditCompanionNodeReviewOptions(nodeId, nodes)) return {};
  const node = nodes[nodeId];
  const canEdit = !workspace.flowActive || node?.kind === 'topic';
  function open(next: 'options' | 'scheduling') { closeActions(); setView(next); }
  return {
    entries: <>
      {canEdit && <CompanionWorkspaceIconRow icon={SlidersHorizontal}
        label={t('desktop.nodeReview.title')} onClick={() => open('options')} />}
      {getReviewItemKind(node) !== 'none' && <CompanionWorkspaceIconRow icon={CalendarClock}
        label={t('desktop.diagnostics.scheduling.title')} onClick={() => open('scheduling')} />}
    </>,
    sheet: view === 'options' ? <CompanionNodeReviewOptionsSheet nodeId={nodeId} open onOpenChange={() => setView(null)} />
      : view === 'scheduling' ? <CompanionSchedulingSheet nodeId={nodeId} onClose={() => setView(null)} /> : null
  };
}
