import type { KeepImportPreviewSummary } from '../../../lib/core/import/importManagerSettings';
import type { NativeReadwiseDetectionSample } from '../../../lib/platform/nativeReadwiseContract';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';

import { ReadwisePreviewSampleList } from './ReadwisePreviewSampleList';

const KEEP_PREVIEW_SAMPLE_LIMIT = 3;

interface KeepImportPreviewSampleGroup {
  samples: NativeReadwiseDetectionSample[];
  sourcePath: string;
}

function countMatchedHighlights(preview: KeepImportPreviewSummary) {
  return preview.samples.reduce((total, sample) => total + sample.detectedHighlightCount, 0);
}

function formatPreviewResult(preview: KeepImportPreviewSummary, t: Translate) {
  const matchedHighlightCount = countMatchedHighlights(preview);
  const documentLabel = t(preview.discoveredCount === 1 ? 'desktop.keepImport.preview.document.one' : 'desktop.keepImport.preview.document.many', { count: preview.discoveredCount });
  const highlightLabel = t(matchedHighlightCount === 1 ? 'desktop.keepImport.preview.highlight.one' : 'desktop.keepImport.preview.highlight.many', { count: matchedHighlightCount });
  return t('desktop.keepImport.preview.result', {
    documentLabel,
    highlightLabel
  });
}

function formatPreviewGuidance(preview: KeepImportPreviewSummary, t: Translate) {
  const sampleCount = collectPreviewSampleGroups(preview).reduce((total, group) => total + group.samples.length, 0);
  if (sampleCount === 0) {
    return preview.unchangedCount > 0
      ? t('desktop.keepImport.preview.alreadyImported')
      : t('desktop.keepImport.preview.noSamples');
  }
  return t('desktop.keepImport.preview.guidance', { count: sampleCount });
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
  const t = useTranslation();
  if (!props.preview) {
    return <p className="text-sm text-foreground/60">{t('desktop.keepImport.preview.empty')}</p>;
  }
  const previewSampleGroups = collectPreviewSampleGroups(props.preview);

  return (
    <>
      <div>
        <p className="text-sm font-semibold leading-5 text-foreground">{formatPreviewResult(props.preview, t)}</p>
        <p className="mt-1 text-sm leading-5 text-foreground/65">{formatPreviewGuidance(props.preview, t)}</p>
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
  const t = useTranslation();
  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="w-[min(860px,calc(100vw-64px))] p-0"
        >
          <section aria-label={t('desktop.keepImport.preview.aria')} className="flex flex-col">
            <header className="px-8 pb-2 pt-7">
              <AppDialogTitle className="text-lg font-normal">{t('desktop.keepImport.preview.title')}</AppDialogTitle>
              <p className="mt-2 text-sm leading-5 text-foreground/65">
                {t('desktop.keepImport.preview.description')}
              </p>
            </header>
            <div className="px-8 py-4">
              <KeepImportPreviewContent preview={props.preview} />
            </div>
            <footer className="flex items-center justify-end gap-2 px-8 pb-6 pt-2">
              <AppButton onClick={() => props.onOpenChange(false)} variant="ghost">
                {t('desktop.keepImport.preview.notNow')}
              </AppButton>
              <AppButton disabled={!props.preview} onClick={props.onConfirm} variant="emphasis">
                {t('desktop.keepImport.preview.enable')}
              </AppButton>
            </footer>
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
