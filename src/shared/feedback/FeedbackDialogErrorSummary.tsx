import { useTranslation } from '../localization/LocalizationProvider';

export function FeedbackErrorSummaryToggle(props: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const t = useTranslation();
  return (
    <label className="flex min-h-9 items-center gap-2 font-shellless-ui text-shellless-meta text-shellless-muted">
      <input
        checked={props.checked}
        onChange={(event) => props.onCheckedChange(event.currentTarget.checked)}
        type="checkbox"
      />
      {t('feedback.errorSummary.label')}
    </label>
  );
}
