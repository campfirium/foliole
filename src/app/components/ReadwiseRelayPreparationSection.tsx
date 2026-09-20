import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type { NativeReadwiseDetectionResult } from '../../../lib/platform/nativeReadwiseContract';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { SettingsSection } from '../../shared/ui';

import type { DraftImportSource } from './importSourceWorkspaceModel';
import { ReadwiseReaderSetupCheckPanel } from './ReadwiseReaderSetupCheckPanel';
import { inspectReadwiseReaderSetup } from './readwiseReaderSetupInspection';
import { ReadwiseDirectorySection, ReadwiseParserFields } from './ReadwiseReaderSetupParts';
import { useReadwiseSetupDraft } from './useReadwiseSetupDraft';

interface Props {
  config: ReadwiseReaderConfig;
  onSave: (input: {
    config: ReadwiseReaderConfig;
    readwiseRootPath: string;
    readwiseSources: DraftImportSource[];
  }) => void;
  readwiseRootPath: string;
  readwiseSources: DraftImportSource[];
}

export function ReadwiseRelayPreparationSection(props: Props) {
  const t = useTranslation();
  const draft = useReadwiseSetupDraft({
    ...props,
    onPathsChange: props.onSave,
    onPreview: (input): Promise<NativeReadwiseDetectionResult> => inspectReadwiseReaderSetup(input),
    open: true
  });
  const canCheck = Boolean(draft.draftRootPath.trim()) && draft.draftSources.some((source) =>
    Boolean(source.kind && source.highlightPath.trim() && source.primaryPath.trim()));
  return (
    <SettingsSection ariaLabel={t('desktop.readwise.section.settings.aria')}
      title={t('desktop.readwise.section.settings.title')}>
      <ReadwiseReaderSetupCheckPanel canCheck={canCheck}
        hasDraftChanges={draft.hasDraftChanges} isChecking={draft.isPreviewing}
        onCheck={() => {
          props.onSave({ config: draft.draftConfig, readwiseRootPath: draft.draftRootPath,
            readwiseSources: draft.draftSources });
          void draft.runPreview();
        }} result={draft.previewResult} />
      <ReadwiseDirectorySection onChooseFolder={draft.chooseFolder}
        onChooseRootFolder={draft.chooseRootFolder} readwiseRootPath={draft.draftRootPath}
        sources={draft.draftSources} />
      <ReadwiseParserFields config={draft.draftConfig} onChange={draft.updateConfig} />
    </SettingsSection>
  );
}
