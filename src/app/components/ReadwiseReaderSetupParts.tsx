import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type { NativeReadwiseDetectionResult } from '../../../lib/platform/nativeReadwiseContract';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle, AppInput, AppStatusBadge } from '../../shared/ui';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { formatReadwiseSourceLabel } from './importSourceWorkspaceModel';
import { FolderButton, resolveFolderPathHint, resolveFolderPathLabel } from './ImportSourceWorkspaceTableParts';

export function getArticlesSource(sources: DraftImportSource[]) {
  return sources.find((source) => source.kind === 'articles') ?? null;
}

export function ReadwiseDirectorySection(props: {
  onChooseFolder: (sourceId: string, field: 'highlightPath' | 'primaryPath') => void;
  onChooseRootFolder: () => void;
  readwiseRootPath: string;
  sources: DraftImportSource[];
}) {
  return (
    <section className="space-y-3">
      <label className="block">
        <span className="block text-sm font-semibold text-foreground">Readwise root folder</span>
        <span className="mt-1 block text-sm text-foreground/65">Choose the root once. The four category folders will be filled in automatically, and you can still adjust them below.</span>
        <div className="mt-3">
          <FolderButton
            label="Readwise root folder"
            onClick={props.onChooseRootFolder}
            path={resolveFolderPathLabel(props.readwiseRootPath, 'Choose folder')}
            tooltip={resolveFolderPathHint(props.readwiseRootPath)}
          />
        </div>
      </label>
      <div className="space-y-3 rounded-lg border border-border bg-bg-elevated px-3 py-3">
        {props.sources.map((source) => (
          <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)]" key={source.id}>
            <div className="pt-2 text-sm font-semibold text-foreground">{source.kind ? formatReadwiseSourceLabel(source.kind) : source.id}</div>
            <FolderButton
              label={`Readwise original folder ${source.id}`}
              onClick={() => props.onChooseFolder(source.id, 'primaryPath')}
              path={resolveFolderPathLabel(source.primaryPath, 'Choose folder')}
              tooltip={resolveFolderPathHint(source.primaryPath)}
            />
            <FolderButton
              label={`Readwise highlight folder ${source.id}`}
              onClick={() => props.onChooseFolder(source.id, 'highlightPath')}
              path={resolveFolderPathLabel(source.highlightPath, 'Choose folder')}
              tooltip={resolveFolderPathHint(source.highlightPath)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export function ReadwiseParserFields(props: {
  config: ReadwiseReaderConfig;
  onChange: (field: keyof ReadwiseReaderConfig, value: string) => void;
}) {
  const fields: Array<{ field: keyof ReadwiseReaderConfig; label: string; description: string }> = [
    { field: 'highlightsHeading', label: 'Highlights heading', description: 'The heading that starts the normal highlights section.' },
    { field: 'newHighlightsHeading', label: 'New highlights heading', description: 'The heading that starts the new-highlights section.' },
    { field: 'highlightSeparator', label: 'Highlight separator', description: 'The text that separates one highlight block from the next. Use \\n for line breaks.' },
    { field: 'tagKeyword', label: 'Tag keyword', description: 'The keyword used before tags inside a highlight block.' },
    { field: 'noteKeyword', label: 'Note keyword', description: 'The keyword used before notes inside a highlight block.' }
  ];

  return (
    <section className="space-y-3">
      {fields.map((entry) => (
        <label className="block" key={entry.field}>
          <span className="block text-sm font-semibold text-foreground">{entry.label}</span>
          <span className="mt-1 block text-sm text-foreground/65">{entry.description}</span>
          <AppInput className="mt-3" onChange={(event) => props.onChange(entry.field, event.target.value)} value={props.config[entry.field]} />
        </label>
      ))}
    </section>
  );
}

export function ReadwisePreviewDialog(props: {
  onCancel: () => void;
  onEnable: () => void;
  open: boolean;
  result: NativeReadwiseDetectionResult | null;
}) {
  const canEnable = Boolean(props.result?.success);

  return (
    <AppDialog onOpenChange={(open) => !open && props.onCancel()} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined} className="left-1/2 top-1/2 w-[min(720px,calc(100vw-80px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-border/35 bg-bg-panel p-0">
          <section className="flex max-h-[min(720px,calc(100vh-80px))] min-h-0 flex-col">
            <header className="border-b border-border/70 px-5 pb-4 pt-5">
              <AppDialogTitle className="text-base font-semibold">Readwise preview</AppDialogTitle>
              <p className="mt-1 text-sm text-foreground/65">Preview the extracted highlights before enabling this setup.</p>
            </header>
            <div className="min-h-0 space-y-4 overflow-auto px-5 py-5">
              {props.result ? (
                <div className="rounded-lg border border-border bg-bg-elevated px-3 py-3">
                  <div className="flex items-center gap-2">
                    <AppStatusBadge label={props.result.success ? 'Preview passed' : 'Preview failed'} tone={props.result.success ? 'success' : 'warning'} />
                    <span className="text-sm text-foreground/70">
                      {props.result.matchedHighlightCount}/{props.result.sampleCount} sampled highlights matched
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-foreground/65">{props.result.message}</p>
                </div>
              ) : null}
              {props.result?.samples.map((sample, index) => (
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
            <footer className="flex items-center justify-between gap-3 border-t border-border/70 px-5 py-4">
              <AppButton onClick={props.onCancel} variant="ghost">
                Cancel
              </AppButton>
              <AppButton disabled={!canEnable} onClick={props.onEnable} variant="primary">
                Enable
              </AppButton>
            </footer>
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
