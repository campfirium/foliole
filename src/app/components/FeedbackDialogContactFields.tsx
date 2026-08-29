import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppInput } from '../../shared/ui';

export function FeedbackContactFields(props: {
  contact: string;
  onContactChange: (value: string) => void;
}) {
  const t = useTranslation();
  return (
    <div className="min-h-12">
      <label className="flex min-w-0 items-center gap-2 text-shellless-meta">
        <span className="sr-only">{t('feedback.contact.label')}</span>
        <AppInput
          aria-label={t('feedback.contact.label')}
          className="h-11 border-0 bg-transparent px-0 font-shellless-ui text-shellless-meta text-shellless-muted shadow-none placeholder:text-shellless-muted hover:bg-transparent focus-visible:ring-0"
          onChange={(event) => props.onContactChange(event.target.value)}
          placeholder={t('feedback.contact.placeholder')}
          value={props.contact}
        />
      </label>
    </div>
  );
}
