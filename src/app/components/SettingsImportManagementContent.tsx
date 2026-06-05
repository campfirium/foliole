import type { ImportNodeTitleStrategy } from '../../../lib/core/import/importedNodeTitle';
import { parseLiteralUnion } from '../../shared/lib/parseLiteralUnion';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { SettingsControlSlot, SettingsRow, SettingsSection } from '../../shared/ui';

import type { DraftImportSource, DraftImportSourceField } from './importSourceWorkspaceModel';
import { importSourceSelectClassName } from './importSourceWorkspaceModel';
import { ImportSourceTable } from './ImportSourceWorkspaceTable';

const IMPORT_NODE_TITLE_STRATEGIES = ['file_name', 'heading'] as const;

function TitleStrategySection(props: {
  onChange: (value: ImportNodeTitleStrategy) => void;
  titleStrategy: ImportNodeTitleStrategy;
}) {
  const t = useTranslation();
  return (
    <SettingsSection
      ariaLabel={t('settings.import.title.sectionAria')}
      className="mb-6"
      description={t('settings.import.title.description')}
      title={t('settings.import.title.sectionTitle')}
    >
      <SettingsRow
        description={t('settings.import.title.sourceDescription')}
        title={t('settings.import.title.source')}
      >
        <SettingsControlSlot>
          <select
            aria-label={t('settings.import.title.sourceAria')}
            className={importSourceSelectClassName}
            onChange={(event) => props.onChange(parseLiteralUnion(event.target.value, IMPORT_NODE_TITLE_STRATEGIES) ?? props.titleStrategy)}
            value={props.titleStrategy}
          >
            <option value="file_name">{t('settings.import.title.fileNameFirst')}</option>
            <option value="heading">{t('settings.import.title.headingFirst')}</option>
          </select>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}

export function SettingsImportManagementContent(props: {
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChangeAction: (sourceId: string, value: string) => void;
  onChangeTitleStrategy: (value: ImportNodeTitleStrategy) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onDisableKeepImport: (sourceId: string) => void;
  onCopySource: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  onPreviewKeepImport: (sourceId: string) => void;
  sources: DraftImportSource[];
  titleStrategy: ImportNodeTitleStrategy;
}) {
  const lastSource = props.sources.at(-1);
  const t = useTranslation();

  return (
    <div className="space-y-6">
      <TitleStrategySection onChange={props.onChangeTitleStrategy} titleStrategy={props.titleStrategy} />
      <SettingsSection
        ariaLabel={t('settings.import.linkedFolders.aria')}
        description={t('settings.import.linkedFolders.description')}
        title={t('settings.import.linkedFolders.title')}
      >
        <div className="min-w-0 overflow-hidden">
          <ImportSourceTable
            onAddSource={() => lastSource ? props.onCopySource(lastSource.id) : undefined}
            onChange={props.onChange}
            onChangeAction={props.onChangeAction}
            onChooseHighlightFolder={props.onChooseHighlightFolder}
            onChoosePrimaryFolder={props.onChoosePrimaryFolder}
            onDisableKeepImport={props.onDisableKeepImport}
            onDeleteSource={props.onDeleteSource}
            onPreviewKeepImport={props.onPreviewKeepImport}
            sources={props.sources}
          />
        </div>
      </SettingsSection>
    </div>
  );
}
