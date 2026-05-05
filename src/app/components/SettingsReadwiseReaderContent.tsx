import { isReadwiseReaderConfigReady, type ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { AppButton, AppStatusBadge, SettingsControlSlot, SettingsRow, SettingsSection } from '../../shared/ui';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { inspectReadwiseReaderSetup } from './readwiseReaderConfigBridge';
import { ReadwiseDirectorySection, ReadwiseParserFields, ReadwisePreviewDialog, getArticlesSource } from './ReadwiseReaderSetupParts';
import { useReadwiseSetupDraft } from './useReadwiseSetupDraft';

function enableReadwiseImportSource(sources: DraftImportSource[]) {
  return sources.map((source) =>
    source.kind === 'articles' && source.highlightPath.trim() && source.primaryPath.trim()
      ? { ...source, keepState: 'enabled' as const }
      : source
  );
}

function canPreviewReadwiseSetup(input: {
  config: ReadwiseReaderConfig;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}) {
  const articlesSource = getArticlesSource(input.readwiseSources);
  return (
    input.readwiseRootPath.trim().length > 0 &&
    Boolean(articlesSource?.highlightPath.trim()) &&
    Boolean(articlesSource?.primaryPath.trim()) &&
    input.config.highlightsHeading.trim().length > 0 &&
    input.config.newHighlightsHeading.trim().length > 0 &&
    input.config.highlightSeparator.trim().length > 0 &&
    input.config.tagKeyword.trim().length > 0 &&
    input.config.noteKeyword.trim().length > 0
  );
}

function ReadwiseSetupSection(props: {
  canPreview: boolean;
  configured: boolean;
  draft: ReturnType<typeof useReadwiseSetupDraft>;
}) {
  return (
    <div className="space-y-6">
      <SettingsSection
        actions={<AppStatusBadge label={props.configured ? 'Configured' : 'Needs preview'} tone={props.configured ? 'success' : 'warning'} />}
        ariaLabel="Readwise Reader setup"
        description="Put the actual Readwise Reader setup here instead of hiding it behind a second click."
        title="Readwise Reader setup"
      >
        <ReadwiseDirectorySection
          onChooseFolder={props.draft.chooseFolder}
          onChooseRootFolder={props.draft.chooseRootFolder}
          readwiseRootPath={props.draft.draftRootPath}
          sources={props.draft.draftSources}
        />
        <ReadwiseParserFields config={props.draft.draftConfig} onChange={props.draft.updateConfig} />
        <SettingsRow description="Preview parsed samples before enabling this setup." title="Preview setup">
          <SettingsControlSlot>
            <AppButton disabled={props.draft.isPreviewing || !props.canPreview} onClick={() => void props.draft.runPreview()} variant="primary">
              {props.draft.isPreviewing ? 'Previewing...' : 'Preview'}
            </AppButton>
          </SettingsControlSlot>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

export function SettingsReadwiseReaderContent(props: {
  config: ReadwiseReaderConfig;
  onSave: (input: {
    config: ReadwiseReaderConfig;
    readwiseRootPath: string;
    readwiseSources: DraftImportSource[];
  }) => void;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}) {
  const draft = useReadwiseSetupDraft({
    config: props.config,
    onPreview: (input) =>
      inspectReadwiseReaderSetup({
        articleDirectoryPath: input.articleDirectoryPath,
        config: input.config,
        fullDocumentDirectoryPath: input.fullDocumentDirectoryPath
      }),
    open: true,
    readwiseRootPath: props.readwiseRootPath,
    readwiseSources: props.readwiseSources
  });
  const canPreview = canPreviewReadwiseSetup({
    config: draft.draftConfig,
    readwiseRootPath: draft.draftRootPath,
    readwiseSources: draft.draftSources
  });
  const configured = props.readwiseRootPath.trim().length > 0 && isReadwiseReaderConfigReady(props.config);

  return (
    <>
      <ReadwiseSetupSection canPreview={canPreview} configured={configured} draft={draft} />
      <ReadwisePreviewDialog
        onCancel={draft.closePreview}
        onEnable={() => {
          props.onSave({
            config: { ...draft.draftConfig, validatedAt: new Date().toISOString() },
            readwiseRootPath: draft.draftRootPath,
            readwiseSources: enableReadwiseImportSource(draft.draftSources)
          });
          draft.closePreview();
        }}
        open={draft.previewOpen}
        result={draft.previewResult}
      />
    </>
  );
}
