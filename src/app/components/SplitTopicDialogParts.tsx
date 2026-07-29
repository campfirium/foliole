import { resolveNodeOpeningText } from '../../../lib/core/nodes/nodeOpeningPreview';
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
    <div className="space-y-settings-panel-y">
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
        <textarea className="mt-2 min-h-settings-row w-full resize-y rounded-md border border-settings-control-border bg-settings-control px-3 py-2 text-ui-md text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring" value={props.form.headerText} onChange={(event) => props.onChange({ ...props.form, headerText: event.target.value })} />
      </label>
      <label className="block text-sm font-medium text-foreground">
        {t('desktop.splitTopic.footerText')}
        <textarea className="mt-2 min-h-settings-row w-full resize-y rounded-md border border-settings-control-border bg-settings-control px-3 py-2 text-ui-md text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring" value={props.form.footerText} onChange={(event) => props.onChange({ ...props.form, footerText: event.target.value })} />
      </label>
    </div>
  );
}

export function SplitTopicPreviewList(props: { delimiter: string; parts: SplitTopicPreviewPart[] }) {
  const t = useTranslation();
  const emptyCopy = props.delimiter ? t('desktop.splitTopic.noPreview') : t('desktop.splitTopic.enterDelimiter');
  return (
    <section aria-label={t('desktop.splitTopic.preview')} className="flex h-full min-h-0 flex-col">
      <div className="border-b border-settings-divider/70 pb-2 text-ui-md font-medium text-foreground">{t('desktop.splitTopic.preview')}</div>
      {props.parts.length === 0 ? (
        <p className="py-settings-panel-y text-ui-md text-muted-foreground">{emptyCopy}</p>
      ) : (
        <div className="app-scrollbar min-h-0 flex-1 divide-y divide-settings-divider/70 overflow-auto">
          {props.parts.map((part, index) => {
            const opening = resolveNodeOpeningText(part.body, part.title);
            return (
              <article className="py-3" key={`${part.title}-${index}`}>
                <div className="text-ui-md font-medium text-foreground">{part.title}</div>
                {opening ? <p className="mt-1 line-clamp-2 text-ui-base text-muted-foreground">{opening}</p> : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
