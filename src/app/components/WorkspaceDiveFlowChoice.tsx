import type { DiveFlowCursor } from '../../../lib/core/flow/dailyFlowSession';
import { listVisibleDives, resolveDiveMembership } from '../../shared/diveMembership';
import { AppDialog, AppDialogBody, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';
import { DiveFlowChoices, useDiveFlowChoiceTitle } from '../../shared/ui/DiveFlowChoices';
import { useWorkspaceStore } from '../../store/workspaceStore';

import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';

export function WorkspaceDiveFlowChoice(props: Pick<WorkspaceLayoutProps, 'review' | 'nodeList' | 'trash'>) {
  const dive = useWorkspaceStore(state => state.reviewSession.dive);
  const open = props.review.onOpenDiveFlow;
  if (!props.review.isStudyMode || !dive?.stop || !open) return null;
  return <Choice {...props} dive={dive} open={open} />;
}

function Choice({ dive, open, nodeList, review, trash }: Pick<WorkspaceLayoutProps, 'review' | 'nodeList' | 'trash'> & {
  dive: DiveFlowCursor; open: NonNullable<WorkspaceLayoutProps['review']['onOpenDiveFlow']>;
}) {
  const title = useDiveFlowChoiceTitle(dive);
  const snapshot = { nodesById: nodeList.nodesById, nodeOrder: nodeList.nodeOrder, trashedNodeIds: trash.trashedNodeIds };
  const dives = listVisibleDives(snapshot);
  return <AppDialog open onOpenChange={value => { if (!value) void open(null); }}>
    <AppDialogPortal>
      <AppDialogOverlay />
      <AppDialogContent className="max-h-[calc(100dvh-32px)] w-[min(420px,calc(100vw-32px))] overflow-y-auto" layout="task">
        <AppDialogTitle>{title}</AppDialogTitle>
        <AppDialogBody>
          <DiveFlowChoices dive={dive} dives={dives} onMode={review.onSetReviewSessionMode}
            onStep={step => void open({ id: dive.id, topicIds: dive.topicIds }, step)}
            onReturn={() => void open(null)}
            onSwitch={target => void open({ id: target.id, topicIds: resolveDiveMembership(snapshot, target).topics })} />
        </AppDialogBody>
      </AppDialogContent>
    </AppDialogPortal>
  </AppDialog>;
}
