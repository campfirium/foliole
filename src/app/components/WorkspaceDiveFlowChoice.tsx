import { useContext, useRef, useState, type ContextType, type ReactNode } from 'react';

import { listVisibleDives, resolveDiveMembership } from '../../shared/diveMembership';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useActionHelpCardsEnabled } from '../../shared/platform/actionHelpCards';
import {
  ActionHelpCard, AppButton, ReviewActionBar, ToolbarActionGroup
} from '../../shared/ui';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { DiveFlowSwitchDialog, useDiveFlowCheckpointTitle } from '../../shared/ui/DiveFlowSwitchDialog';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { DiveFlowCheckpointContext } from './diveFlowActionContext';
import { ReviewToolbarSessionActions } from './ReviewToolbarSessionFrame';
import { useReadingReadShortcut } from './useReadingReadShortcut';

type Checkpoint = NonNullable<ContextType<typeof DiveFlowCheckpointContext>>;

export function useDiveCheckpointTitle() {
  return useDiveFlowCheckpointTitle(useContext(DiveFlowCheckpointContext)?.dive);
}

async function stepDiveCheckpoint({ dive, open }: Checkpoint, next: 'continue' | 'retry',
  t: ReturnType<typeof useTranslation>) {
  const opened = await open({ id: dive.id, topicIds: dive.topicIds }, next);
  const session = useWorkspaceStore.getState().reviewSession;
  if (!opened || session.dive?.id !== dive.id || session.currentNodeId) return;
  if (next === 'retry') {
    showAppRuntimeNotice(t('desktop.diveCheckpoint.nothingReady'), 'info');
  } else if (dive.phase === 'topics') {
    showAppRuntimeNotice(t('desktop.diveCheckpoint.noNewUnread'), 'info');
  }
}

export function WorkspaceDiveFlowChoice({ checkpoint, className, immersive, onExit }: {
  checkpoint: Checkpoint; className: string; immersive: boolean; onExit: () => void;
}) {
  const { dive, open, snapshot } = checkpoint;
  const t = useTranslation();
  const showHelp = useActionHelpCardsEnabled();
  const step = (next: 'continue' | 'retry') => void stepDiveCheckpoint(checkpoint, next, t);
  const advance = () => step('continue');
  const switchTrigger = useRef<HTMLButtonElement>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const workspace = switchOpen && !immersive ? switchTrigger.current?.closest<HTMLElement>('.workspace-responsive-shell') : null;
  const position = workspace ? {
    left: 'calc(50% + (var(--workspace-rail-width) + var(--workspace-list-current-width) + var(--workspace-list-splitter-width) - var(--workspace-right-sidebar-current-width) - var(--workspace-right-sidebar-splitter-width)) / 2)'
  } : undefined;
  useReadingReadShortcut(() => { if (!switchOpen) advance(); });
  const dives = listVisibleDives(snapshot);
  const retry = dive.phase === 'today' && dive.stop === 'waiting';
  const buttonClass = 'min-w-20 border-border px-4';
  const help = (title: string, body: string, children: ReactNode) => showHelp
    ? <ActionHelpCard help={{ title, body }} placement="above">{children}</ActionHelpCard>
    : children;
  const global = t('desktop.diveCheckpoint.global');
  const switchLabel = t('desktop.diveCheckpoint.switch');
  const next = t('desktop.diveCheckpoint.continue');
  const exit = t('desktop.diveCheckpoint.exit');
  const recheck = t('desktop.diveCheckpoint.recheck');
  const advanceHelp = t(dive.phase === 'initial' ? 'desktop.diveCheckpoint.checkTodayHelp'
    : dive.phase === 'today' ? 'desktop.diveCheckpoint.startReadingHelp' : 'desktop.diveCheckpoint.nextReadingHelp');

  return (
    <ReviewActionBar ariaLabel="Flow toolbar" className={className} mode="study" surface={immersive ? 'overlay' : 'panel'}
      primary={<ReviewToolbarSessionActions surface={immersive ? 'overlay' : 'panel'} actions={
        <ToolbarActionGroup ariaLabel={t('desktop.workspace.studyActions')} className="grid grid-cols-4 gap-2">
          {help(global, t('desktop.diveCheckpoint.globalHelp'),
            <AppButton className={buttonClass} size="md" onClick={() => void open(null)}>{global}</AppButton>)}
          {retry ? help(recheck, t('desktop.diveCheckpoint.checkTodayHelp'),
            <AppButton className={buttonClass} size="md" onClick={() => step('retry')}>{recheck}</AppButton>)
            : help(switchLabel, t('desktop.diveCheckpoint.switchHelp'), (
              <DiveFlowSwitchDialog desktop currentId={dive.id} dives={dives} onOpenChange={setSwitchOpen}
                {...(workspace && position ? { container: workspace, position } : {})}
                trigger={<AppButton ref={switchTrigger} className={buttonClass} size="md">{switchLabel}</AppButton>}
                onSwitch={target => void open({ id: target.id, topicIds: resolveDiveMembership(snapshot, target).topics })} />
            ))}
          {help(next, advanceHelp, <AppButton className={buttonClass} size="md" onClick={advance}>{next}</AppButton>)}
          {help(exit, t('desktop.diveCheckpoint.exitHelp'),
            <AppButton className={buttonClass} size="md" onClick={onExit}>{exit}</AppButton>)}
        </ToolbarActionGroup>
      } />}
    />
  );
}
