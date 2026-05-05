import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type { NativeReadwiseDetectionResult } from '../../../lib/platform/nativeReadwiseContract';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { getArticlesSource, ReadwiseDirectorySection, ReadwiseParserFields, ReadwisePreviewDialog } from './ReadwiseReaderSetupParts';
import { useReadwiseSetupDraft } from './useReadwiseSetupDraft';

function ReadwiseConfigDialogSurface(props: {
  canPreview: boolean;
  draft: ReturnType<typeof useReadwiseSetupDraft>;
  onCancel: () => void;
}) {
  return (
    <AppDialog onOpenChange={props.onCancel} open>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined} className="left-1/2 top-1/2 w-[min(920px,calc(100vw-72px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-border/35 bg-bg-panel p-0">
          <section className="flex max-h-[min(820px,calc(100vh-72px))] min-h-0 flex-col">
            <header className="border-b border-border/70 px-5 pb-4 pt-5">
              <AppDialogTitle className="text-base font-semibold">Readwise Reader settings</AppDialogTitle>
              <p className="mt-1 text-sm text-foreground/65">Choose the Readwise folders, fill the parsing rules, then preview the extracted highlights before enabling this source.</p>
            </header>
            <div className="min-h-0 space-y-5 overflow-auto px-5 py-5">
              <ReadwiseDirectorySection
                onChooseFolder={props.draft.chooseFolder}
                onChooseRootFolder={props.draft.chooseRootFolder}
                readwiseRootPath={props.draft.draftRootPath}
                sources={props.draft.draftSources}
              />
              <ReadwiseParserFields config={props.draft.draftConfig} onChange={props.draft.updateConfig} />
            </div>
            <footer className="flex items-center justify-between gap-3 border-t border-border/70 px-5 py-4">
              <AppButton onClick={props.onCancel} variant="ghost">
                Cancel
              </AppButton>
              <AppButton disabled={props.draft.isPreviewing || !props.canPreview} onClick={() => void props.draft.runPreview()} variant="primary">
                {props.draft.isPreviewing ? 'Previewing...' : 'Preview'}
              </AppButton>
            </footer>
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

export function ReadwiseReaderConfigDialog(props: {
  config: ReadwiseReaderConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPreview: (input: {
    articleDirectoryPath: string;
    config: ReadwiseReaderConfig;
    fullDocumentDirectoryPath: string;
  }) => Promise<NativeReadwiseDetectionResult>;
  onSave: (input: {
    config: ReadwiseReaderConfig;
    readwiseRootPath: string;
    readwiseSources: DraftImportSource[];
  }) => void;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}) {
  const draft = useReadwiseSetupDraft(props);
  const articlesSource = getArticlesSource(draft.draftSources);
  const canPreview =
    draft.draftRootPath.trim().length > 0 &&
    Boolean(articlesSource?.highlightPath.trim()) &&
    Boolean(articlesSource?.primaryPath.trim()) &&
    draft.draftConfig.highlightsHeading.trim().length > 0 &&
    draft.draftConfig.newHighlightsHeading.trim().length > 0 &&
    draft.draftConfig.highlightSeparator.trim().length > 0 &&
    draft.draftConfig.tagKeyword.trim().length > 0 &&
    draft.draftConfig.noteKeyword.trim().length > 0;

  return (
    <>
      {props.open ? <ReadwiseConfigDialogSurface canPreview={canPreview} draft={draft} onCancel={() => props.onOpenChange(false)} /> : null}
      <ReadwisePreviewDialog
        onCancel={draft.closePreview}
        onEnable={() => {
          props.onSave({
            config: { ...draft.draftConfig, validatedAt: new Date().toISOString() },
            readwiseRootPath: draft.draftRootPath,
            readwiseSources: draft.draftSources
          });
          draft.closePreview();
          props.onOpenChange(false);
        }}
        open={draft.previewOpen}
        result={draft.previewResult}
      />
    </>
  );
}
