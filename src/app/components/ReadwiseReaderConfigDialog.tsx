import { isReadwiseReaderConfigReady, type ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type { NativeReadwiseDetectionResult } from '../../../lib/platform/nativeReadwiseContract';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { ReadwiseIntegrationSwitch, ReadwiseReaderSetupCheckPanel } from './ReadwiseReaderSetupCheckPanel';
import { ReadwiseDirectorySection, ReadwiseParserFields } from './ReadwiseReaderSetupParts';
import { useReadwiseSetupDraft } from './useReadwiseSetupDraft';

interface ReadwiseReaderConfigDialogProps {
  config: ReadwiseReaderConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPreview: (input: {
    articleDirectoryPath: string;
    config: ReadwiseReaderConfig;
    fullDocumentDirectoryPath: string;
    sources: Array<{ articleDirectoryPath: string; fullDocumentDirectoryPath: string; label: string }>;
  }) => Promise<NativeReadwiseDetectionResult>;
  onSave: (input: {
    config: ReadwiseReaderConfig;
    readwiseRootPath: string;
    readwiseSources: DraftImportSource[];
  }) => void;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}

function enableReadwiseImportSource(sources: DraftImportSource[]) {
  return sources.map((source) =>
    source.kind && source.highlightPath.trim() && source.primaryPath.trim()
      ? { ...source, keepState: 'enabled' as const }
      : source
  );
}

function disableReadwiseImportSource(sources: DraftImportSource[]) {
  return sources.map((source) => (source.kind ? { ...source, keepState: 'draft' as const } : source));
}

function getValidatedReadwiseConfig(draft: ReturnType<typeof useReadwiseSetupDraft>) {
  return draft.previewResult?.success
    ? { ...draft.draftConfig, validatedAt: new Date().toISOString() }
    : draft.draftConfig;
}

function isReadwiseIntegrationEnabled(sources: DraftImportSource[]) {
  const readwiseSources = sources.filter((source) => source.kind);
  return readwiseSources.length > 0 && readwiseSources.every((source) => source.keepState === 'enabled');
}

function canCheckReadwiseSetup(input: {
  config: ReadwiseReaderConfig;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}) {
  return (
    input.readwiseRootPath.trim().length > 0 &&
    input.readwiseSources.some((source) => source.kind) &&
    input.readwiseSources.every((source) => !source.kind || Boolean(source.highlightPath.trim() && source.primaryPath.trim())) &&
    input.config.highlightsHeading.trim().length > 0 &&
    input.config.newHighlightsHeading.trim().length > 0 &&
    input.config.highlightSeparator.trim().length > 0 &&
    input.config.tagKeyword.trim().length > 0 &&
    input.config.noteKeyword.trim().length > 0
  );
}

function ReadwiseConfigDialogHeader(props: {
  canChangeIntegration: boolean;
  integrationEnabled: boolean;
  onChangeIntegration: () => void;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-border/70 px-5 pb-4 pt-5">
      <div className="min-w-0">
        <AppDialogTitle className="text-base font-semibold">Readwise Reader integration</AppDialogTitle>
        <p className="mt-1 text-sm text-foreground/65">Choose the folders, run a check, then turn this on.</p>
      </div>
      <ReadwiseIntegrationSwitch
        disabled={!props.canChangeIntegration}
        enabled={props.integrationEnabled}
        onToggle={props.onChangeIntegration}
      />
    </header>
  );
}

function ReadwiseConfigDialogSurface(props: {
  canChangeIntegration: boolean;
  canPreview: boolean;
  draft: ReturnType<typeof useReadwiseSetupDraft>;
  integrationEnabled: boolean;
  onCancel: () => void;
  onChangeIntegration: () => void;
  onCheck: () => void;
}) {
  return (
    <AppDialog onOpenChange={props.onCancel} open>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="left-1/2 top-1/2 w-[min(1280px,calc(100vw-96px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border-border/35 bg-bg-panel p-0"
        >
          <section className="flex max-h-[min(760px,calc(100vh-96px))] min-h-0 flex-col">
            <ReadwiseConfigDialogHeader
              canChangeIntegration={props.canChangeIntegration}
              integrationEnabled={props.integrationEnabled}
              onChangeIntegration={props.onChangeIntegration}
            />
            <div className="min-h-0 flex-1 overflow-auto">
              <ReadwiseReaderSetupCheckPanel
                canCheck={props.canPreview}
                hasDraftChanges={props.draft.hasDraftChanges}
                isChecking={props.draft.isPreviewing}
                onCheck={props.onCheck}
                result={props.draft.previewResult}
              />
              <div className="px-5 py-5">
                <ReadwiseDirectorySection
                  onChooseFolder={props.draft.chooseFolder}
                  onChooseRootFolder={props.draft.chooseRootFolder}
                  readwiseRootPath={props.draft.draftRootPath}
                  sources={props.draft.draftSources}
                />
                <ReadwiseParserFields config={props.draft.draftConfig} onChange={props.draft.updateConfig} />
              </div>
            </div>
            <footer className="flex items-center justify-between gap-3 border-t border-border/70 px-5 py-4">
              <AppButton onClick={props.onCancel} variant="ghost">
                Cancel
              </AppButton>
            </footer>
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

export function ReadwiseReaderConfigDialog(props: ReadwiseReaderConfigDialogProps) {
  const draft = useReadwiseSetupDraft(props);
  const canPreview = canCheckReadwiseSetup({
    config: draft.draftConfig,
    readwiseRootPath: draft.draftRootPath,
    readwiseSources: draft.draftSources
  });

  function saveReadwiseSetup(readwiseSources: DraftImportSource[]) {
    props.onSave({
      config: draft.draftConfig,
      readwiseRootPath: draft.draftRootPath,
      readwiseSources
    });
  }

  function saveReadwiseSetupWithConfig(readwiseSources: DraftImportSource[], config: ReadwiseReaderConfig) {
    props.onSave({
      config,
      readwiseRootPath: draft.draftRootPath,
      readwiseSources
    });
  }

  const configured = props.readwiseRootPath.trim().length > 0 && isReadwiseReaderConfigReady(props.config);
  const integrationEnabled = isReadwiseIntegrationEnabled(props.readwiseSources);
  const canChangeIntegration = integrationEnabled || Boolean(draft.previewResult?.success) || (configured && !draft.hasDraftChanges);

  return (
    props.open ? (
      <ReadwiseConfigDialogSurface
        canChangeIntegration={canChangeIntegration}
        canPreview={canPreview}
        draft={draft}
        integrationEnabled={integrationEnabled}
        onCancel={() => props.onOpenChange(false)}
        onChangeIntegration={() => {
          saveReadwiseSetupWithConfig(
            integrationEnabled ? disableReadwiseImportSource(draft.draftSources) : enableReadwiseImportSource(draft.draftSources),
            integrationEnabled ? draft.draftConfig : getValidatedReadwiseConfig(draft)
          );
        }}
        onCheck={() => {
          saveReadwiseSetup(draft.draftSources);
          void draft.runPreview();
        }}
      />
    ) : null
  );
}
