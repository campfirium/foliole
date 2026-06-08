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
    <div className="grid min-h-12 gap-x-5 border-b border-foreground/[0.13] sm:grid-cols-2">
      <label className="flex min-w-0 items-center gap-2 text-sm">
        <span className="shrink-0 font-medium text-foreground/70">{t('feedback.name.label')}</span>
        <AppInput
          aria-label={t('feedback.name.label')}
          className="h-11 border-0 bg-transparent px-0 text-sm text-foreground shadow-none hover:bg-transparent focus-visible:ring-0"
          onChange={(event) => props.onNameChange(event.target.value)}
          placeholder={t('feedback.optional')}
          value={props.name}
        />
      </label>
      <label className="flex min-w-0 items-center gap-2 text-sm">
        <span className="shrink-0 font-medium text-foreground/70">{t('feedback.contact.label')}</span>
        <AppInput
          aria-label={t('feedback.contact.label')}
          className="h-11 border-0 bg-transparent px-0 text-sm text-foreground shadow-none hover:bg-transparent focus-visible:ring-0"
          onChange={(event) => props.onContactChange(event.target.value)}
          placeholder={t('feedback.optional')}
          value={props.contact}
        />
      </label>
    </div>
  );
}
