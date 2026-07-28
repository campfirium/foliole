import type { SplitTopicPreviewPart } from '../../../lib/core/nodes/splitTopicModel';
import type { SplitTopicDisposition } from '../../../lib/platform/nativeSplitTopicPreferencesContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppInput, SettingsSegmentedControl, settingsSwitchClassName, settingsSwitchKnobClassName } from '../../shared/ui';

export interface SplitTopicFormState {
  delimiter: string;
  disposition: SplitTopicDisposition;
  footerText: string;
  headerText: string;
  keepDelimiter: boolean;
}

export const DEFAULT_SPLIT_TOPIC_FORM: SplitTopicFormState = {
  delimiter: '---',
  disposition: 'replace',
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
    <div className="space-y-5">
      <div>
        <div className="mb-2 text-sm font-medium text-foreground">{t('desktop.splitTopic.originalTopic')}</div>
        <SettingsSegmentedControl
          ariaLabel={t('desktop.splitTopic.originalTopic')}
          onChange={(value) => props.onChange({ ...props.form, disposition: value as SplitTopicDisposition })}
          options={[
            { label: t('desktop.splitTopic.replace'), value: 'replace' },
            { label: t('desktop.splitTopic.keep'), value: 'keep-as-parent' }
          ]}
          value={props.form.disposition}
        />
      </div>
      <label className="block text-sm font-medium text-foreground">
        {t('desktop.splitTopic.delimiter')}
        <AppInput className="mt-2" value={props.form.delimiter} onChange={(event) => props.onChange({ ...props.form, delimiter: event.target.value })} />
      </label>
      <div className="flex items-center justify-between gap-4 text-sm text-foreground/80">
        <span>{t('desktop.splitTopic.keepDelimiter')}</span>
        <button aria-checked={props.form.keepDelimiter} aria-label={t('desktop.splitTopic.keepDelimiter')} className={settingsSwitchClassName(props.form.keepDelimiter)} onClick={() => props.onChange({ ...props.form, keepDelimiter: !props.form.keepDelimiter })} role="switch" type="button">
          <span className={settingsSwitchKnobClassName(props.form.keepDelimiter)} />
        </button>
      </div>
      <label className="block text-sm font-medium text-foreground">
        {t('desktop.splitTopic.headerText')}
        <textarea className="mt-2 min-h-28 w-full resize-y rounded-md border border-settings-control-border bg-settings-control px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring" value={props.form.headerText} onChange={(event) => props.onChange({ ...props.form, headerText: event.target.value })} />
      </label>
      <label className="block text-sm font-medium text-foreground">
        {t('desktop.splitTopic.footerText')}
        <textarea className="mt-2 min-h-28 w-full resize-y rounded-md border border-settings-control-border bg-settings-control px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring" value={props.form.footerText} onChange={(event) => props.onChange({ ...props.form, footerText: event.target.value })} />
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
