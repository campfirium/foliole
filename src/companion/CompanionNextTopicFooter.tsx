import { ArrowRight } from 'lucide-react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton } from '../shared/ui';

export function CompanionNextTopicFooter(props: {
  disabled?: boolean;
  onOpen(): void;
}) {
  const t = useTranslation();
  return <div className="mx-auto w-full max-w-[760px] border-t border-companion-divider pt-3">
    <AppButton className="min-h-14 w-full" contentClassName="w-full justify-between" disabled={props.disabled}
      onClick={props.onOpen} variant="list">
      <span>{t('companion.reading.nextTopic')}</span>
      <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
    </AppButton>
  </div>;
}
