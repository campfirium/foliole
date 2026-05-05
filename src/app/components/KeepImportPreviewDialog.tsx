import type { KeepImportPreviewSummary } from '../../../lib/core/import/importManagerSettings';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';

import { ReadwisePreviewSampleList } from './ReadwisePreviewSampleList';

function formatSummary(preview: KeepImportPreviewSummary) {
  const items = [`${preview.newCount} new`, `${preview.updatedCount} updated`, `${preview.unchangedCount} unchanged`];
  if (preview.blockedCount > 0) {
    items.push(`${preview.blockedCount} blocked`);
  }
  if (preview.failedCount > 0) {
    items.push(`${preview.failedCount} failed`);
  }
  return items.join(' · ');
}

function formatEntryDetail(detail: string | null) {
  return detail?.trim() || 'Ready to process when enabled.';
}

function formatContentPreview(contentPreview: string | null) {
  return contentPreview?.trim() || null;
}

function formatHighlightSummary(count: number, sampleCount: number) {
  if (count <= 0) {
    return null;
  }
  return `${sampleCount}/${count} highlight sample${sampleCount === 1 ? '' : 's'} shown`;
}

function KeepImportPreviewEntryCard(props: { sample: KeepImportPreviewSummary['samples'][number] }) {
  return (
    <div className="rounded-lg border border-border/60 bg-bg-elevated px-3 py-2">
      <p className="truncate text-sm font-medium text-foreground">{props.sample.sourcePath}</p>
      <p className="mt-1 text-xs text-foreground/58">{formatEntryDetail(props.sample.detail)}</p>
      {formatContentPreview(props.sample.contentPreview) ? (
        <div className="mt-3 rounded-md bg-bg-panel px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-foreground/45">Result preview</p>
          <p className="mt-1 text-sm text-foreground/78">{formatContentPreview(props.sample.contentPreview)}</p>
        </div>
      ) : null}
      {props.sample.highlightSamples.length > 0 ? (
        <div className="mt-3">
          <p className="mb-2 text-xs text-foreground/58">
            {formatHighlightSummary(props.sample.detectedHighlightCount, props.sample.highlightSamples.length)}
          </p>
          <ReadwisePreviewSampleList
            hasGap={props.sample.detectedHighlightCount > props.sample.highlightSamples.length}
            samples={props.sample.highlightSamples}
            sourceName={props.sample.sourcePath}
          />
        </div>
      ) : null}
    </div>
  );
}

function KeepImportPreviewContent(props: { preview: KeepImportPreviewSummary | null }) {
  if (!props.preview) {
    return <p className="text-sm text-foreground/60">No preview result available.</p>;
  }

  return (
    <>
      <div className="rounded-xl border border-border/70 bg-bg-elevated px-4 py-3">
        <p className="text-sm font-medium text-foreground">{formatSummary(props.preview)}</p>
        <p className="mt-1 text-xs text-foreground/55">
          Found {props.preview.discoveredCount} file{props.preview.discoveredCount === 1 ? '' : 's'} in this preview.
        </p>
      </div>
      <div className="mt-4 space-y-2">
        {props.preview.samples.map((sample) => (
          <KeepImportPreviewEntryCard key={`${sample.status}-${sample.sourcePath}`} sample={sample} />
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
          className="left-1/2 top-1/2 w-[min(680px,calc(100vw-64px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-border/35 bg-bg-panel p-0"
        >
          <section aria-label="Keep import preview" className="flex flex-col">
            <header className="border-b border-border/60 px-6 pb-4 pt-5">
              <AppDialogTitle className="text-base font-semibold">Preview keep import</AppDialogTitle>
              <p className="mt-1 text-sm text-foreground/62">{props.sourceLabel}</p>
            </header>
            <div className="px-6 py-5">
              <KeepImportPreviewContent preview={props.preview} />
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-border/60 px-6 py-4">
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
