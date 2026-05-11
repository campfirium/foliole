import type { NativeReadwiseDetectionResult } from '../../../lib/platform/nativeReadwiseContract';
import { AppButton, settingsSwitchClassName, settingsSwitchKnobClassName } from '../../shared/ui';

import { ReadwisePreviewSampleList } from './ReadwisePreviewSampleList';

export function ReadwiseIntegrationSwitch(props: {
  disabled: boolean;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      aria-checked={props.enabled}
      aria-label="Readwise import"
      className="inline-flex items-center gap-2 rounded-md text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
  const previewSourceName = props.result.samples[0]?.sourceName ?? 'Sample source topic';
  const sampleLabel =
    props.result.sampleCount === 1
      ? 'One sample highlight is'
      : `${props.result.sampleCount} sample highlights are`;
  const hasPreviewGap =
    props.result.detectedHighlightCount > props.result.samples.length &&
    props.result.samples.length >= 3;

  return (
    <div className="mt-4 border-t border-settings-divider/55 pt-4">
      <div>
        <div className="text-sm font-medium text-foreground">
          Found {props.result.totalArticleCount} article
          {props.result.totalArticleCount === 1 ? '' : 's'}, including{' '}
          {props.result.highlightedArticleCount} with highlights.
        </div>
        <p className="mt-1 text-sm leading-5 text-foreground/65">
          {sampleLabel} shown below. Adjust the import settings and preview again if it does not
          look right.
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
  const buttonLabel = props.isChecking ? 'Previewing...' : 'Preview';

  return (
    <section className="border-b border-settings-divider/55 bg-settings-group px-5 py-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-[0.95rem] font-normal text-foreground">Import preview</h3>
            {props.hasDraftChanges ? (
              <span className="text-sm font-medium text-amber-700">Unsaved changes</span>
            ) : null}
          </div>
          <p className="mt-1 max-w-[760px] text-sm leading-5 text-foreground/65">
            Preview what the current import settings and rules will bring into Foliole.
          </p>
        </div>
        <div className="flex justify-start lg:justify-end">
          <AppButton
            disabled={!props.canCheck || props.isChecking}
            onClick={props.onCheck}
            variant="primary"
          >
            {buttonLabel}
          </AppButton>
        </div>
      </div>
      {props.result ? <ReadwiseSetupPreviewResult result={props.result} /> : null}
    </section>
  );
}
