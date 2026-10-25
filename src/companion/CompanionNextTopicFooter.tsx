import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton } from '../shared/ui';

export function CompanionNextTopicFooter(props: {
  disabled?: boolean;
  onOpen(): void;
}) {
  const t = useTranslation();
  return <div className="mx-auto flex w-full max-w-[760px] justify-center py-6">
    <AppButton className="min-h-11 min-w-36 px-5 text-base" disabled={props.disabled}
      onClick={props.onOpen}>
      {t('companion.reading.nextTopic')}
    </AppButton>
  </div>;
}
