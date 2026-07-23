import type { NativeReadwiseDetectionResult } from '../../../lib/platform/nativeReadwiseContract';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import { AppButton, settingsSwitchClassName, settingsSwitchKnobClassName } from '../../shared/ui';

import { ReadwisePreviewSampleList } from './ReadwisePreviewSampleList';

function formatSetupPreviewCounts(result: NativeReadwiseDetectionResult, t: Translate) {
  const highlightLabel = t(result.checkedSourceCount === 1 ? 'desktop.readwise.setup.highlightFile.one' : 'desktop.readwise.setup.highlightFile.many', { count: result.checkedSourceCount });
  const documentLabel = t(result.totalArticleCount === 1 ? 'desktop.readwise.setup.documentFile.one' : 'desktop.readwise.setup.documentFile.many', { count: result.totalArticleCount });
  const base = t('desktop.readwise.setup.checked', {
    documentLabel,
    highlightLabel
  });
  const labels = [
    result.highlightOnlySourceCount > 0
      ? t('desktop.readwise.setup.highlightOnly', { count: result.highlightOnlySourceCount })
      : null,
    result.unparsedHighlightFileCount > 0
      ? t('desktop.readwise.setup.unparsed', { count: result.unparsedHighlightFileCount })
      : null
  ].filter((label): label is string => Boolean(label));
  return `${base}${labels.length ? `; ${labels.join(', ')}` : ''}.`;
}

export function ReadwiseIntegrationSwitch(props: {
  disabled: boolean;
  enabled: boolean;
  onToggle: () => void;
}) {
  const t = useTranslation();
  return (
    <button
      aria-checked={props.enabled}
      aria-label={t('desktop.readwise.setup.import')}
      className="inline-flex items-center gap-2 rounded-md text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45"
      disabled={props.disabled}
      onClick={props.onToggle}
      role="switch"
      type="button"
    >
      <span className={settingsSwitchClassName(props.enabled)}>
        <span className={settingsSwitchKnobClassName(props.enabled)} />
      </span>
    </button>
  );
}

function ReadwiseSetupPreviewResult(props: { result: NativeReadwiseDetectionResult }) {
  const t = useTranslation();
  const previewSourceName = props.result.samples[0]?.sourceName ?? t('desktop.readwise.setup.preview.sampleSource');
  const sampleLabel =
    props.result.sampleCount === 1
      ? t('desktop.readwise.setup.oneSample')
      : t('desktop.readwise.setup.sampleCount', { count: props.result.sampleCount });
  const hasPreviewGap =
    props.result.detectedHighlightCount > props.result.samples.length &&
    props.result.samples.length >= 3;

  return (
    <div className="mt-4 border-t border-settings-divider/55 pt-4">
      <div>
        <div className="text-sm font-medium text-foreground">
          {formatSetupPreviewCounts(props.result, t)}
        </div>
        <p className="mt-1 text-sm leading-5 text-foreground/65">
          {sampleLabel}
        </p>
      </div>
      {props.result.samples.length ? (
        <ReadwisePreviewSampleList
          hasGap={hasPreviewGap}
          samples={props.result.samples}
          sourceName={previewSourceName}
        />
      ) : null}
    </div>
  );
}

export function ReadwiseReaderSetupCheckPanel(props: {
  canCheck: boolean;
  hasDraftChanges: boolean;
  isChecking: boolean;
  onCheck: () => void;
  result: NativeReadwiseDetectionResult | null;
}) {
  const t = useTranslation();
  return (
    <section className="relative bg-settings-group px-5 py-4 after:absolute after:bottom-0 after:left-5 after:right-5 after:border-b after:border-settings-divider/70">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-[0.95rem] font-normal text-foreground">{t('desktop.readwise.setup.preview.title')}</h3>
            {props.hasDraftChanges ? (
              <span className="text-sm font-medium text-amber-700">{t('desktop.readwise.setup.preview.unsaved')}</span>
            ) : null}
          </div>
          <p className="mt-1 max-w-[760px] text-sm leading-5 text-foreground/65">
            {t('desktop.readwise.setup.preview.description')}
          </p>
        </div>
        <div className="flex justify-start lg:justify-end">
          <AppButton
            disabled={!props.canCheck}
            loading={props.isChecking}
            loadingLabel={t('desktop.readwise.setup.preview.running')}
            onClick={props.onCheck}
            variant="default"
          >
            {t('desktop.readwise.setup.preview.action')}
          </AppButton>
        </div>
      </div>
      {props.result ? <ReadwiseSetupPreviewResult result={props.result} /> : null}
    </section>
  );
}
