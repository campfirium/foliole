import { useEffect, useState } from 'react';

import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type { NativeReadwiseDetectionResult } from '../../../lib/platform/nativeReadwiseContract';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  AppInput,
  AppStatusBadge
} from '../../shared/ui';

function DetectionSummary({ result }: { result: NativeReadwiseDetectionResult | null }) {
  if (!result) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-bg-elevated px-3 py-3 text-sm text-foreground/62">
        Run detection after setting the separator. Saving stays disabled until the samples pass and you confirm them.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-elevated px-3 py-3">
      <div className="flex items-center gap-2">
        <AppStatusBadge label={result.success ? 'Detection passed' : 'Detection failed'} tone={result.success ? 'success' : 'warning'} />
        <span className="text-sm text-foreground/70">
          {result.matchedHighlightCount}/{result.sampleCount} sampled highlights matched
        </span>
      </div>
      <p className="mt-2 text-sm text-foreground/65">{result.message}</p>
    </div>
  );
}

function DetectionSamples({ result }: { result: NativeReadwiseDetectionResult | null }) {
  if (!result || result.samples.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {result.samples.map((sample, index) => (
        <article className="rounded-lg border border-border bg-bg-elevated px-3 py-3" key={`${sample.sourceName}-${index}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">{sample.sourceName}</p>
            <AppStatusBadge label={sample.matched ? 'Matched' : 'Missing'} tone={sample.matched ? 'success' : 'warning'} />
          </div>
          <p className="mt-2 text-sm text-foreground/80">{sample.highlightText}</p>
          <p className="mt-2 text-xs text-foreground/58">{sample.excerpt || 'No matching excerpt was found in the full document sample.'}</p>
        </article>
      ))}
    </div>
  );
}

function useReadwiseReaderConfigDraft(props: {
  config: ReadwiseReaderConfig;
  open: boolean;
  onDetect: (config: ReadwiseReaderConfig) => Promise<NativeReadwiseDetectionResult>;
}) {
  const [draftConfig, setDraftConfig] = useState(props.config);
  const [detectionResult, setDetectionResult] = useState<NativeReadwiseDetectionResult | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);

  useEffect(() => {
    if (!props.open) {
      return;
    }
    setDraftConfig(props.config);
    setDetectionResult(null);
    setConfirmSave(false);
  }, [props.config, props.open]);

  return {
    canSave: Boolean(detectionResult?.success) && confirmSave,
    confirmSave,
    detectionResult,
    draftConfig,
    isDetecting,
    resetDraft: (value: string) => {
      setDraftConfig((current) => ({ ...current, highlightSeparator: value, validatedAt: '' }));
      setDetectionResult(null);
      setConfirmSave(false);
    },
    runDetection: async () => {
      setIsDetecting(true);
      setConfirmSave(false);
      try {
        setDetectionResult(await props.onDetect(draftConfig));
      } finally {
        setIsDetecting(false);
      }
    },
    setConfirmSave
  };
}

function ReadwiseReaderConfigFooter(props: {
  canSave: boolean;
  draftConfig: ReadwiseReaderConfig;
  isDetecting: boolean;
  onCancel: () => void;
  onDetect: () => Promise<void>;
  onSave: (config: ReadwiseReaderConfig) => void;
}) {
  return (
    <footer className="flex items-center justify-between gap-3 border-t border-border/70 px-5 py-4">
      <AppButton onClick={props.onCancel} variant="ghost">
        Cancel
      </AppButton>
      <div className="flex items-center gap-2">
        <AppButton disabled={props.isDetecting || props.draftConfig.highlightSeparator.trim().length === 0} onClick={() => void props.onDetect()} variant="ghost">
          {props.isDetecting ? 'Detecting...' : 'Detect'}
        </AppButton>
        <AppButton
          disabled={!props.canSave}
          onClick={() => props.onSave({ ...props.draftConfig, validatedAt: new Date().toISOString() })}
          variant="primary"
        >
          Save
        </AppButton>
      </div>
    </footer>
  );
}

export function ReadwiseReaderConfigDialog(props: {
  config: ReadwiseReaderConfig;
  open: boolean;
  readwiseRootPath: string;
  onDetect: (config: ReadwiseReaderConfig) => Promise<NativeReadwiseDetectionResult>;
  onOpenChange: (open: boolean) => void;
  onSave: (config: ReadwiseReaderConfig) => void;
}) {
  const draft = useReadwiseReaderConfigDraft(props);

  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined} className="left-1/2 top-1/2 w-[min(760px,calc(100vw-72px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-border/35 bg-bg-panel p-0">
          <section className="flex max-h-[min(760px,calc(100vh-72px))] min-h-0 flex-col">
            <header className="border-b border-border/70 px-5 pb-4 pt-5">
              <AppDialogTitle className="text-base font-semibold">Readwise Reader settings</AppDialogTitle>
              <p className="mt-1 text-sm text-foreground/65">
                Detection reads samples from <span className="font-medium text-foreground">Articles</span> and <span className="font-medium text-foreground">Full Document Contents/Articles</span>.
              </p>
              <p className="mt-1 text-xs text-foreground/52">{props.readwiseRootPath}</p>
            </header>
            <div className="min-h-0 space-y-4 overflow-auto px-5 py-5">
              <label className="block">
                <span className="block text-sm font-semibold text-foreground">Highlight separator</span>
                <span className="mt-1 block text-sm text-foreground/65">
                  Enter the text that separates one highlight block from the next. Use <code>\n</code> for line breaks.
                </span>
                <AppInput className="mt-3" onChange={(event) => draft.resetDraft(event.target.value)} value={draft.draftConfig.highlightSeparator} />
              </label>
              <DetectionSummary result={draft.detectionResult} />
              <DetectionSamples result={draft.detectionResult} />
              <label className="flex items-start gap-3 rounded-lg border border-border bg-bg-elevated px-3 py-3">
                <input
                  checked={draft.confirmSave}
                  className="mt-1"
                  disabled={!draft.detectionResult?.success}
                  onChange={(event) => draft.setConfirmSave(event.target.checked)}
                  type="checkbox"
                />
                <span className="text-sm text-foreground/72">I checked the sampled matches and want to save this Readwise setup.</span>
              </label>
            </div>
            <ReadwiseReaderConfigFooter
              canSave={draft.canSave}
              draftConfig={draft.draftConfig}
              isDetecting={draft.isDetecting}
              onCancel={() => props.onOpenChange(false)}
              onDetect={draft.runDetection}
              onSave={(config) => {
                props.onSave(config);
                props.onOpenChange(false);
              }}
            />
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
