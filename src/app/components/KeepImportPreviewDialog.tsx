import type { KeepImportPreviewSummary } from '../../../lib/core/import/importManagerSettings';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';

import { ReadwisePreviewSampleList } from './ReadwisePreviewSampleList';

const KEEP_PREVIEW_SAMPLE_LIMIT = 2;

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function countMatchedHighlights(preview: KeepImportPreviewSummary) {
  return preview.samples.reduce((total, sample) => total + sample.detectedHighlightCount, 0);
}

function formatPreviewResult(preview: KeepImportPreviewSummary) {
  const matchedHighlightCount = countMatchedHighlights(preview);
  return `Checked ${formatCount(preview.discoveredCount, 'full document file')}; ${formatCount(matchedHighlightCount, 'matched highlight')}.`;
}

function formatPreviewGuidance(preview: KeepImportPreviewSummary) {
  const visibleSampleCount = preview.samples.reduce(
    (total, sample) => total + Math.min(sample.highlightSamples.length, KEEP_PREVIEW_SAMPLE_LIMIT),
    0
  );
  const label = visibleSampleCount === 1 ? 'One sample highlight is' : `${visibleSampleCount} sample highlights are`;
  return `${label} shown below. Adjust the watch folder settings and preview again if it does not look right.`;
}

function KeepImportPreviewEntry(props: { sample: KeepImportPreviewSummary['samples'][number] }) {
  if (props.sample.highlightSamples.length === 0) {
    return null;
  }

  return (
    <section>
      <p className="mt-6 text-sm font-semibold leading-5 text-foreground">“{props.sample.sourcePath}”</p>
      <ReadwisePreviewSampleList
        hasGap={false}
        maxSamples={KEEP_PREVIEW_SAMPLE_LIMIT}
        samples={props.sample.highlightSamples}
        showGap={false}
        showSourceName={false}
        sourceName={props.sample.sourcePath}
      />
    </section>
  );
}

function KeepImportPreviewContent(props: { preview: KeepImportPreviewSummary | null }) {
  if (!props.preview) {
    return <p className="text-sm text-foreground/60">No preview result available.</p>;
  }

  return (
    <>
      <div>
        <p className="text-sm font-semibold leading-5 text-foreground">{formatPreviewResult(props.preview)}</p>
        <p className="mt-1 text-sm leading-5 text-foreground/65">{formatPreviewGuidance(props.preview)}</p>
      </div>
      <div>
        {props.preview.samples.map((sample) => (
          <KeepImportPreviewEntry key={`${sample.status}-${sample.sourcePath}`} sample={sample} />
        ))}
      </div>
    </>
  );
}

export function KeepImportPreviewDialog(props: {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  preview: KeepImportPreviewSummary | null;
  sourceLabel: string;
}) {
  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="left-1/2 top-1/2 w-[min(860px,calc(100vw-64px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border-border/35 bg-bg-elevated p-0"
        >
          <section aria-label="Keep import preview" className="flex flex-col">
            <header className="px-8 pb-2 pt-7">
              <AppDialogTitle className="text-lg font-normal">Import preview</AppDialogTitle>
              <p className="mt-2 text-sm leading-5 text-foreground/65">
                Preview what this watch folder will bring into Foliole.
              </p>
            </header>
            <div className="px-8 py-4">
              <KeepImportPreviewContent preview={props.preview} />
            </div>
            <footer className="flex items-center justify-end gap-2 px-8 pb-6 pt-2">
              <AppButton onClick={() => props.onOpenChange(false)} variant="ghost">
                Not now
              </AppButton>
              <AppButton disabled={!props.preview} onClick={props.onConfirm} variant="primary">
                Enable
              </AppButton>
            </footer>
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
