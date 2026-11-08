import type { DiveFlowCursor } from '../../../lib/core/flow/dailyFlowSession';
import type { Dive } from '../../../lib/core/nodes/dive';
import type { ReviewSessionMode } from '../../../lib/core/review/queue/reviewQueueTypes';
import { useTranslation } from '../localization/LocalizationProvider';

import { AppButton } from './Button';

export function useDiveFlowChoiceTitle(dive: DiveFlowCursor) {
  const t = useTranslation();
  if (dive.stop === 'waiting') return t('desktop.nodeList.dive.waiting');
  if (dive.phase === 'initial') return t(dive.stop === 'empty' ? 'desktop.nodeList.dive.initialEmpty' : 'desktop.nodeList.dive.initialDone');
  if (dive.phase === 'today') return t(dive.stop === 'empty' ? 'desktop.nodeList.dive.todayEmpty' : 'desktop.nodeList.dive.todayDone');
  return t(dive.stop === 'empty' ? 'desktop.nodeList.dive.topicsEmpty' : 'desktop.nodeList.dive.topicsDone');
}

export function DiveFlowChoices(props: {
  dive: DiveFlowCursor;
  dives: Dive[];
  onStep: (step: 'continue' | 'retry') => void;
  onSwitch: (dive: Dive) => void;
  onReturn: () => void;
  onMode: (mode: ReviewSessionMode) => void;
}) {
  const t = useTranslation();
  const { dive } = props;
  const available = props.dives.filter(other => other.id !== dive.id);
  return <div className="grid min-w-0 gap-3">
    <AppButton className="min-h-10 whitespace-normal" onClick={() => props.onStep('continue')}>
      {t(dive.phase === 'initial' ? 'desktop.nodeList.dive.continueToday' :
        dive.phase === 'today' ? 'desktop.nodeList.dive.continueTopics' : 'desktop.nodeList.dive.continueReading')}
    </AppButton>
    {dive.phase === 'today' && dive.stop === 'waiting' ?
      <AppButton className="min-h-10 whitespace-normal" variant="default" onClick={() => props.onStep('retry')}>{t('desktop.nodeList.dive.retryToday')}</AppButton> : null}
    <AppButton className="min-h-10 whitespace-normal" variant="default" onClick={props.onReturn}>{t('desktop.nodeList.dive.returnToFlow')}</AppButton>
    {available.length ? <label className="grid min-w-0 gap-1">
      {t('desktop.nodeList.dive.switchFlow')}
      <select className="min-h-10 min-w-0 w-full rounded-md border border-border bg-background px-2" value=""
        onChange={event => { const target = available.find(other => other.id === event.target.value); if (target) props.onSwitch(target); }}>
        <option value="" disabled>{t('desktop.nodeList.dive.selectDive')}</option>
        {available.map(other => <option key={other.id} value={other.id}>{other.title}</option>)}
      </select>
    </label> : null}
    <label className="grid min-w-0 gap-1">
      {t('desktop.nodeList.dive.flowMode')}
      <select className="min-h-10 min-w-0 w-full rounded-md border border-border bg-background px-2" value={dive.mode}
        onChange={event => props.onMode(event.target.value as ReviewSessionMode)}>
        <option value="recommended">{t('desktop.reviewSession.mode.recommended')}</option>
        <option value="review-first">{t('desktop.reviewSession.mode.reviewFirst')}</option>
        <option value="reading-only">{t('desktop.reviewSession.mode.readingOnly')}</option>
      </select>
    </label>
  </div>;
}
