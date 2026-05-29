import type { KeepImportPreviewSummary } from '../../../lib/core/import/importManagerSettings';
import type { NativeReadwiseDetectionSample } from '../../../lib/platform/nativeReadwiseContract';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';

import { ReadwisePreviewSampleList } from './ReadwisePreviewSampleList';

const KEEP_PREVIEW_SAMPLE_LIMIT = 3;

interface KeepImportPreviewSampleGroup {
  samples: NativeReadwiseDetectionSample[];
  sourcePath: string;
}

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
  const sampleCount = collectPreviewSampleGroups(preview).reduce((total, group) => total + group.samples.length, 0);
  if (sampleCount === 0) {
    return preview.unchangedCount > 0
      ? 'This document is already imported and has no new highlight samples to show.'
      : 'No sample highlights are available for this preview.';
  }
  return `${formatCount(sampleCount, 'sample highlight')} shown below. Adjust the watch folder settings and preview again if they do not look right.`;
}

function collectPreviewSampleGroups(preview: KeepImportPreviewSummary): KeepImportPreviewSampleGroup[] {
  const groups: KeepImportPreviewSampleGroup[] = [];
  let remaining = KEEP_PREVIEW_SAMPLE_LIMIT;
  for (const sample of preview.samples) {
    if (remaining <= 0) {
      break;
    }
    const visibleSamples = sample.highlightSamples.slice(0, remaining);
    if (visibleSamples.length === 0) {
      continue;
    }
    groups.push({ samples: visibleSamples, sourcePath: sample.sourcePath });
    remaining -= visibleSamples.length;
  }
  return groups;
}

function KeepImportPreviewEntry(props: { group: KeepImportPreviewSampleGroup }) {
  return (
    <section>
      <p className="mt-6 text-sm font-semibold leading-5 text-foreground">“{props.group.sourcePath}”</p>
      <ReadwisePreviewSampleList
        hasGap={false}
        samples={props.group.samples}
        showGap={false}
        showSourceName={false}
        sourceName={props.group.sourcePath}
      />
    </section>
  );
}

function KeepImportPreviewContent(props: { preview: KeepImportPreviewSummary | null }) {
  if (!props.preview) {
    return <p className="text-sm text-foreground/60">No preview result available.</p>;
  }
  const previewSampleGroups = collectPreviewSampleGroups(props.preview);

  return (
    <>
      <div>
        <p className="text-sm font-semibold leading-5 text-foreground">{formatPreviewResult(props.preview)}</p>
        <p className="mt-1 text-sm leading-5 text-foreground/65">{formatPreviewGuidance(props.preview)}</p>
      </div>
      <div>
        {previewSampleGroups.map((group) => <KeepImportPreviewEntry group={group} key={group.sourcePath} />)}
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
