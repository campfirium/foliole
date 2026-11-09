import { useContext, type ContextType, type ReactNode } from 'react';

import { listVisibleDives, resolveDiveMembership } from '../../shared/diveMembership';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useActionHelpCardsEnabled } from '../../shared/platform/actionHelpCards';
import {
  ActionHelpCard, AppButton, AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem,
  AppDropdownMenuTrigger, ReviewActionBar, ToolbarActionGroup
} from '../../shared/ui';

import { DiveFlowCheckpointContext } from './diveFlowActionContext';
import { ReviewToolbarSessionActions } from './ReviewToolbarSessionFrame';
import { useReadingReadShortcut } from './useReadingReadShortcut';

type Checkpoint = NonNullable<ContextType<typeof DiveFlowCheckpointContext>>;

export function useDiveCheckpointTitle() {
  const checkpoint = useContext(DiveFlowCheckpointContext);
  const t = useTranslation();
  if (!checkpoint) return undefined;
  const { phase, stop } = checkpoint.dive;
  if (stop === 'finished' && phase === 'initial') return t('desktop.diveCheckpoint.queueClear');
  if (phase === 'topics' && checkpoint.dive.hasWork) return t('desktop.diveCheckpoint.readingComplete');
  return t('desktop.diveCheckpoint.clearForNow');
}

export function WorkspaceDiveFlowChoice({ checkpoint, className, immersive, onExit }: {
  checkpoint: Checkpoint; className: string; immersive: boolean; onExit: () => void;
}) {
  const { dive, open, snapshot } = checkpoint;
  const t = useTranslation();
  const showHelp = useActionHelpCardsEnabled();
  const step = (next: 'continue' | 'retry') => void open({ id: dive.id, topicIds: dive.topicIds }, next);
  const advance = () => step('continue');
  useReadingReadShortcut(advance);
  const alternatives = listVisibleDives(snapshot).filter(target => target.id !== dive.id);
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
              <AppDropdownMenu>
                <AppDropdownMenuTrigger asChild>
                  <AppButton className={buttonClass} disabled={!alternatives.length} size="md">{switchLabel}</AppButton>
                </AppDropdownMenuTrigger>
                <AppDropdownMenuContent side="top" align="start">
                  {alternatives.map(target => (
                    <AppDropdownMenuItem key={target.id}
                      onSelect={() => void open({ id: target.id, topicIds: resolveDiveMembership(snapshot, target).topics })}>
                      {target.title}
                    </AppDropdownMenuItem>
                  ))}
                </AppDropdownMenuContent>
              </AppDropdownMenu>
            ))}
          {help(next, advanceHelp, <AppButton className={buttonClass} size="md" onClick={advance}>{next}</AppButton>)}
          {help(exit, t('desktop.diveCheckpoint.exitHelp'),
            <AppButton className={buttonClass} size="md" onClick={onExit}>{exit}</AppButton>)}
        </ToolbarActionGroup>
      } />}
    />
  );
}
