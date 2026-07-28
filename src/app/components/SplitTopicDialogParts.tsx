import type { SplitTopicPreviewPart } from '../../../lib/core/nodes/splitTopicModel';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppInput } from '../../shared/ui';

export interface SplitTopicFormState {
  delimiter: string;
  footerText: string;
  headerText: string;
  keepDelimiter: boolean;
}

export const DEFAULT_SPLIT_TOPIC_FORM: SplitTopicFormState = {
  delimiter: '',
  footerText: '',
  headerText: '',
  keepDelimiter: false
};

export function SplitTopicControls(props: {
  form: SplitTopicFormState;
  onChange: (form: SplitTopicFormState) => void;
}) {
  const t = useTranslation();
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-foreground">
        {t('desktop.splitTopic.delimiter')}
        <AppInput className="mt-2" value={props.form.delimiter} onChange={(event) => props.onChange({ ...props.form, delimiter: event.target.value })} />
      </label>
      <label className="flex items-center gap-2 text-sm text-foreground/80">
        <input
          checked={props.form.keepDelimiter}
          className="size-4"
          onChange={(event) => props.onChange({ ...props.form, keepDelimiter: event.target.checked })}
          type="checkbox"
        />
        {t('desktop.splitTopic.keepDelimiter')}
      </label>
      <label className="block text-sm font-medium text-foreground">
        {t('desktop.splitTopic.headerText')}
        <AppInput className="mt-2" value={props.form.headerText} onChange={(event) => props.onChange({ ...props.form, headerText: event.target.value })} />
      </label>
      <label className="block text-sm font-medium text-foreground">
        {t('desktop.splitTopic.footerText')}
        <AppInput className="mt-2" value={props.form.footerText} onChange={(event) => props.onChange({ ...props.form, footerText: event.target.value })} />
      </label>
    </div>
  );
}

export function SplitTopicPreviewList(props: { delimiter: string; parts: SplitTopicPreviewPart[] }) {
  const t = useTranslation();
  const emptyCopy = props.delimiter ? t('desktop.splitTopic.noPreview') : t('desktop.splitTopic.enterDelimiter');
  return (
    <section aria-label={t('desktop.splitTopic.preview')} className="min-h-0">
      <div className="mb-2 text-sm font-medium text-foreground">{t('desktop.splitTopic.preview')}</div>
      {props.parts.length === 0 ? (
        <p className="rounded-md border border-border bg-bg-subtle p-4 text-sm text-foreground/65">{emptyCopy}</p>
      ) : (
        <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
          {props.parts.map((part, index) => (
            <article className="rounded-md border border-border bg-bg-subtle p-3" key={`${part.title}-${index}`}>
              <div className="text-sm font-medium text-foreground">{part.title}</div>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-5 text-foreground/68">{part.body}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
