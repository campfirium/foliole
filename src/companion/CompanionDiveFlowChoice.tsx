import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { DiveFlowCursor } from '../../lib/core/flow/dailyFlowSession';
import { listVisibleDives, resolveDiveMembership } from '../shared/diveMembership';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton, ToolbarActionGroup } from '../shared/ui';
import { DiveFlowSwitchDialog, useDiveFlowCheckpointTitle } from '../shared/ui/DiveFlowSwitchDialog';

import { CompanionReviewActionFooter } from './CompanionReviewActionFooter';
import type { useCompanionArticleSurface } from './useCompanionArticleSurface';

export function CompanionDiveFlowChoice({ dive, snapshot, surface }: {
  dive: DiveFlowCursor;
  snapshot: WorkspaceSnapshot;
  surface: Pick<ReturnType<typeof useCompanionArticleSurface>, 'openDiveFlow' | 'flowError' | 'handleTabAction'>;
}) {
  const t = useTranslation();
  const title = useDiveFlowCheckpointTitle(dive);
  const buttonClass = 'min-w-0 whitespace-normal px-1';
  return <>
    <section className="companion-flow-complete min-h-full px-4">
      <div>
        <h2 className="break-words">{title}</h2>
        {surface.flowError && <p role="alert" className="mt-3 break-words text-center">{surface.flowError}</p>}
      </div>
    </section>
    <CompanionReviewActionFooter primary={
      <ToolbarActionGroup ariaLabel={t('desktop.workspace.studyActions')} fullWidth
        className="grid grid-cols-4 gap-1">
        <AppButton className={buttonClass} onClick={() => void surface.openDiveFlow(null)}>
          {t('desktop.diveCheckpoint.global')}
        </AppButton>
        <DiveFlowSwitchDialog currentId={dive.id} dives={listVisibleDives(snapshot)}
          trigger={<AppButton className={buttonClass}>{t('desktop.diveCheckpoint.switch')}</AppButton>}
          onSwitch={target => void surface.openDiveFlow({ id: target.id, topicIds: resolveDiveMembership(snapshot, target).topics })} />
        <AppButton className={buttonClass} onClick={() => void surface.openDiveFlow({ id: dive.id, topicIds: dive.topicIds }, 'continue')}>
          {t('desktop.diveCheckpoint.continue')}
        </AppButton>
        <AppButton className={buttonClass} onClick={() => surface.handleTabAction('recent')}>
          {t('desktop.diveCheckpoint.exit')}
        </AppButton>
      </ToolbarActionGroup>
    } />
  </>;
}
