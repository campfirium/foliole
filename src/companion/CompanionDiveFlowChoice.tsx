import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { DiveFlowCursor } from '../../lib/core/flow/dailyFlowSession';
import { listVisibleDives, resolveDiveMembership } from '../shared/diveMembership';
import { DiveFlowChoices, useDiveFlowChoiceTitle } from '../shared/ui/DiveFlowChoices';

import type { useCompanionArticleSurface } from './useCompanionArticleSurface';

export function CompanionDiveFlowChoice(props: {
  dive: DiveFlowCursor;
  snapshot: WorkspaceSnapshot;
  surface: ReturnType<typeof useCompanionArticleSurface>;
}) {
  const { dive, snapshot, surface } = props;
  const title = useDiveFlowChoiceTitle(dive);
  return <section className="companion-page-start grid min-w-0 gap-4 px-4 pb-4">
    <h1 className="break-words text-lg font-semibold">{title}</h1>
    <DiveFlowChoices dive={dive} dives={listVisibleDives(snapshot)} onMode={surface.setFlowSessionMode}
      onStep={step => void surface.openDiveFlow({ id: dive.id, topicIds: dive.topicIds }, step)}
      onReturn={() => void surface.openDiveFlow(null)}
      onSwitch={target => void surface.openDiveFlow({ id: target.id, topicIds: resolveDiveMembership(snapshot, target).topics })} />
    {surface.flowError ? <p role="alert" className="break-words">{surface.flowError}</p> : null}
  </section>;
}
