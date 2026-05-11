import type { NativeReadwiseDetectionResult } from '../../../lib/platform/nativeReadwiseContract';
import { AppButton, AppStatusBadge, settingsSwitchClassName, settingsSwitchKnobClassName } from '../../shared/ui';

import { ReadwisePreviewSampleList } from './ReadwisePreviewSampleList';

type SetupCheckStatus = 'incomplete' | 'unchecked' | 'checking' | 'passed' | 'failed';

function getSetupCheckStatus(props: {
  canCheck: boolean;
  isChecking: boolean;
  result: NativeReadwiseDetectionResult | null;
}): SetupCheckStatus {
  if (!props.canCheck) {
    return 'incomplete';
  }
  if (props.isChecking) {
    return 'checking';
  }
  if (props.result?.success) {
    return 'passed';
  }
  if (props.result) {
    return 'failed';
  }
  return 'unchecked';
}

function getStatusCopy(status: SetupCheckStatus) {
  if (status === 'incomplete') {
    return {
      description: 'Fill the folders and fields below before running a check.',
      label: 'Setup incomplete',
      tone: 'neutral' as const
    };
  }
  if (status === 'checking') {
    return {
      description: 'Checking a sample with the current setup.',
      label: 'Checking',
      tone: 'info' as const
    };
  }
  if (status === 'passed') {
    return {
      description: 'The sample imported correctly. You can turn this on now.',
      label: 'Ready to enable',
      tone: 'success' as const
    };
  }
  if (status === 'failed') {
    return {
      description: 'The sample did not import. Adjust the setup and run another check.',
      label: 'Check failed',
      tone: 'warning' as const
    };
  }
  return {
      description: 'Run a check before turning this on.',
    label: 'Not checked yet',
    tone: 'neutral' as const
  };
}

export function ReadwiseIntegrationSwitch(props: {
  disabled: boolean;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      aria-checked={props.enabled}
      aria-label="Readwise Reader integration"
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

export function ReadwiseReaderSetupCheckPanel(props: {
  canCheck: boolean;
  hasDraftChanges: boolean;
  isChecking: boolean;
  onCheck: () => void;
  result: NativeReadwiseDetectionResult | null;
}) {
  const status = getSetupCheckStatus({
    canCheck: props.canCheck,
    isChecking: props.isChecking,
    result: props.result
  });
  const copy = getStatusCopy(status);
  const previewSourceName = props.result?.samples[0]?.sourceName ?? 'Sample source topic';
  const hasPreviewGap = Boolean(
    props.result && props.result.detectedHighlightCount > props.result.samples.length && props.result.samples.length >= 3
  );
  const buttonLabel = props.isChecking ? 'Checking...' : 'Check setup';

  return (
    <section className="border-b border-settings-divider/55 bg-settings-group px-5 py-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <AppStatusBadge label={copy.label} tone={copy.tone} />
            {props.hasDraftChanges ? (
              <span className="text-sm font-medium text-amber-700">Unsaved changes</span>
            ) : null}
          </div>
          <p className="mt-1 max-w-[760px] text-sm leading-5 text-foreground/65">{copy.description}</p>
        </div>
        <div className="flex justify-start lg:justify-end">
          <AppButton disabled={!props.canCheck || props.isChecking} onClick={props.onCheck} variant="subtle">
            {buttonLabel}
          </AppButton>
        </div>
      </div>
      {props.result ? (
        <div className="mt-4 border-t border-settings-divider/55 pt-4">
          <div>
            <div className="text-sm font-medium text-foreground">
              {props.result.highlightedArticleCount} of {props.result.totalArticleCount} article{props.result.totalArticleCount === 1 ? '' : 's'} have highlights
            </div>
            <p className="mt-1 text-sm leading-5 text-foreground/65">
              Showing {props.result.sampleCount} sample highlight{props.result.sampleCount === 1 ? '' : 's'} below.
            </p>
          </div>
          {props.result.samples.length ? (
            <ReadwisePreviewSampleList hasGap={hasPreviewGap} samples={props.result.samples} sourceName={previewSourceName} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
