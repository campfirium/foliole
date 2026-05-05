import type { ReadwiseImportScope, ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type { NativeReadwiseDetectionResult } from '../../../lib/platform/nativeReadwiseContract';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  AppStatusBadge,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_PATH_BUTTON_WIDTH_CLASS_NAME,
  SETTINGS_SELECT_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  settingsFieldClassName
} from '../../shared/ui';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { formatReadwiseSourceLabel } from './importSourceWorkspaceModel';
import { FolderButton, resolveFolderPathHint, resolveFolderPathLabel } from './ImportSourceWorkspaceTableParts';
import { ReadwisePreviewSampleList } from './ReadwisePreviewSampleList';


export function getArticlesSource(sources: DraftImportSource[]) {
  return sources.find((source) => source.kind === 'articles') ?? null;
}

function ReadwiseFolderMatrix(props: {
  onChooseFolder: (sourceId: string, field: 'highlightPath' | 'primaryPath') => void;
  sources: Array<{ id: string; label: string; highlightPath: string; primaryPath: string }>;
}) {
  return (
    <div className="hidden gap-2 md:grid" style={{ gridTemplateColumns: `84px repeat(${props.sources.length}, minmax(0, 1fr))` }}>
      <div aria-hidden="true" />
      {props.sources.map((source) => (
        <div className="px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45" key={source.id}>
          {source.label}
        </div>
      ))}
      <div className="flex h-10 items-center px-1 text-sm font-medium text-foreground/62">Content</div>
      {props.sources.map((source) => (
        <FolderButton
          key={`${source.id}-content`}
          label={`Readwise original folder ${source.id}`}
          onClick={() => props.onChooseFolder(source.id, 'primaryPath')}
          path={resolveFolderPathLabel(source.primaryPath, source.label)}
          tooltip={resolveFolderPathHint(source.primaryPath)}
        />
      ))}
      <div className="flex h-10 items-center px-1 text-sm font-medium text-foreground/62">Highlights</div>
      {props.sources.map((source) => (
        <FolderButton
          key={`${source.id}-highlights`}
          label={`Readwise highlight folder ${source.id}`}
          onClick={() => props.onChooseFolder(source.id, 'highlightPath')}
          path={resolveFolderPathLabel(source.highlightPath, source.label)}
          tooltip={resolveFolderPathHint(source.highlightPath)}
        />
      ))}
    </div>
  );
}

function ReadwiseFolderStack(props: {
  onChooseFolder: (sourceId: string, field: 'highlightPath' | 'primaryPath') => void;
  sources: Array<{ id: string; label: string; highlightPath: string; primaryPath: string }>;
}) {
  return (
    <div className="space-y-3 md:hidden">
      {props.sources.map((source) => (
        <div className="space-y-2 rounded-lg border border-border/80 bg-bg-panel px-3 py-3" key={source.id}>
          <div className="text-sm font-semibold text-foreground">{source.label}</div>
          <div className="grid gap-2">
            <div className="space-y-1">
              <div className="px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">Content</div>
              <FolderButton
                label={`Readwise original folder ${source.id}`}
                onClick={() => props.onChooseFolder(source.id, 'primaryPath')}
                path={resolveFolderPathLabel(source.primaryPath, source.label)}
                tooltip={resolveFolderPathHint(source.primaryPath)}
              />
            </div>
            <div className="space-y-1">
              <div className="px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">Highlights</div>
              <FolderButton
                label={`Readwise highlight folder ${source.id}`}
                onClick={() => props.onChooseFolder(source.id, 'highlightPath')}
                path={resolveFolderPathLabel(source.highlightPath, source.label)}
                tooltip={resolveFolderPathHint(source.highlightPath)}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReadwiseDirectorySection(props: {
  onChooseFolder: (sourceId: string, field: 'highlightPath' | 'primaryPath') => void;
  onChooseRootFolder: () => void;
  readwiseRootPath: string;
  sources: DraftImportSource[];
}) {
  const sourceColumns = props.sources.map((source) => ({
    id: source.id,
    label: source.kind ? formatReadwiseSourceLabel(source.kind) : source.id,
    highlightPath: source.highlightPath,
    primaryPath: source.primaryPath
  }));

  return (
    <>
      <SettingsRow
        description="Choose the root once. The four category folders will be filled in automatically, and you can still adjust them below."
        title="Readwise root folder"
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <FolderButton
            className={SETTINGS_PATH_BUTTON_WIDTH_CLASS_NAME}
            label="Readwise root folder"
            onClick={props.onChooseRootFolder}
            path={resolveFolderPathLabel(props.readwiseRootPath, 'Choose')}
            tooltip={resolveFolderPathHint(props.readwiseRootPath)}
          />
        </SettingsControlSlot>
      </SettingsRow>
      <div className="relative px-5 py-5 before:absolute before:left-5 before:right-5 before:top-0 before:border-t before:border-settings-divider/55" data-settings-row>
        <div className="mb-4">
          <h4 className="text-[0.95rem] font-normal text-foreground">Category folders</h4>
          <p className="mt-0.5 text-sm text-foreground/65">Generated from the root folder and still adjustable per category.</p>
        </div>
        <ReadwiseFolderMatrix onChooseFolder={props.onChooseFolder} sources={sourceColumns} />
        <ReadwiseFolderStack onChooseFolder={props.onChooseFolder} sources={sourceColumns} />
      </div>
    </>
  );
}


function getReadwiseTextInputWidth(value: string) {
  return `${Math.max(12, Math.min(34, value.length + 2))}ch`;
}

export function ReadwiseParserFields(props: {
  config: ReadwiseReaderConfig;
  onChange: (field: keyof ReadwiseReaderConfig, value: string) => void;
}) {
  const fields: Array<{ field: keyof ReadwiseReaderConfig; label: string; description: string }> = [
    { field: 'highlightsHeading', label: 'Highlights heading', description: 'The heading that starts the normal highlights section.' },
    { field: 'newHighlightsHeading', label: 'New highlights heading', description: 'The heading that starts the new-highlights section.' },
    {
      field: 'highlightSeparator',
      label: 'Highlight starter',
      description: 'How each highlight usually starts, for example - or >. Leave it empty only if your highlights are split by blank lines instead. Use \\n for line breaks.'
    },
    {
      field: 'tagKeyword',
      label: 'Tag starter',
      description: 'The tag line starter, for example Tags:. Fill only the core starter text, not the leading spaces or list marker.'
    },
    {
      field: 'noteKeyword',
      label: 'Note starter',
      description: 'The note line starter, for example Note:. Fill only the core starter text, not the leading spaces or list marker.'
    }
  ];

  return (
    <>
      <ReadwiseImportScopeField importScope={props.config.importScope} onChange={(value) => props.onChange('importScope', value)} />
      {fields.map((entry) => (
        <SettingsRow description={entry.description} key={entry.field} title={entry.label}>
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <input
              aria-label={entry.label}
              className={settingsFieldClassName('max-w-full')}
              onChange={(event) => props.onChange(entry.field, event.target.value)}
              style={{ width: getReadwiseTextInputWidth(String(props.config[entry.field])) }}
              value={props.config[entry.field]}
            />
          </SettingsControlSlot>
        </SettingsRow>
      ))}
    </>
  );
}

function ReadwiseImportScopeField(props: {
  importScope: ReadwiseImportScope;
  onChange: (value: ReadwiseImportScope) => void;
}) {
  const importScopeOptions: Array<{ description: string; label: string; value: ReadwiseImportScope }> = [
    {
      description: 'Skip files that do not have any parsed highlights.',
      label: 'Only with highlights',
      value: 'highlights_only'
    },
    {
      description: 'Import every file from the selected Readwise content folder.',
      label: 'Import all',
      value: 'all'
    }
  ];

  return (
    <SettingsRow
      description={importScopeOptions.find((option) => option.value === props.importScope)?.description}
      title="Import scope"
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <select aria-label="Readwise import scope" className={settingsFieldClassName(`w-auto ${SETTINGS_SELECT_WIDTH_CLASS_NAME}`)} onChange={(event) => props.onChange(event.target.value as ReadwiseImportScope)} value={props.importScope}>
          {importScopeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function ReadwisePreviewDialog(props: {
  onCancel: () => void;
  onEnable: () => void;
  open: boolean;
  result: NativeReadwiseDetectionResult | null;
}) {
  const canEnable = Boolean(props.result?.success);
  const previewSourceName = props.result?.samples[0]?.sourceName ?? 'Sample article';
  const hasPreviewGap = Boolean(props.result && props.result.detectedHighlightCount > props.result.samples.length && props.result.samples.length >= 3);

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
              {props.result?.samples.length ? (
                <ReadwisePreviewSampleList hasGap={hasPreviewGap} samples={props.result.samples} sourceName={previewSourceName} />
              ) : null}
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
