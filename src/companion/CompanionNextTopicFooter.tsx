import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton } from '../shared/ui';

import { isFlowArticleEndVisible } from './CompanionBottomReviewBar';

export function CompanionNextTopicFooter(props: {
  disabled?: boolean;
  onOpen(button: HTMLButtonElement): void;
}) {
  const t = useTranslation();
  return <div className="mx-auto flex w-full max-w-[760px] justify-center py-6">
    <AppButton className="min-h-11 min-w-36 px-5 text-base opacity-30 disabled:opacity-30" disabled={props.disabled}
      onClick={event => props.onOpen(event.currentTarget)}>
      {t('companion.reading.nextTopic')}
    </AppButton>
  </div>;
}

export function CompanionFlowNextTopicFooter(props: {
  nodeId: string;
  disabled: boolean;
  onContinue(): void;
}) {
  return <CompanionNextTopicFooter disabled={props.disabled} onOpen={button => {
    if (isFlowArticleEndVisible(button, props.nodeId)) props.onContinue();
  }} />;
}
