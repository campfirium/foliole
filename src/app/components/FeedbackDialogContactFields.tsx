import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppInput } from '../../shared/ui';

export function FeedbackContactFields(props: {
  contact: string;
  name: string;
  onContactChange: (value: string) => void;
  onNameChange: (value: string) => void;
}) {
  const t = useTranslation();
  return (
    <div className="grid min-h-12 gap-x-5 sm:grid-cols-2">
      <label className="flex min-w-0 items-center gap-2 text-shellless-meta">
        <span className="sr-only">{t('feedback.name.label')}</span>
        <AppInput
          aria-label={t('feedback.name.label')}
          className="h-11 border-0 bg-transparent px-0 font-shellless-ui text-shellless-meta text-shellless-muted shadow-none placeholder:text-shellless-muted hover:bg-transparent focus-visible:ring-0"
          onChange={(event) => props.onNameChange(event.target.value)}
          placeholder={t('feedback.name.placeholder')}
          value={props.name}
        />
      </label>
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
