import type { ImportNodeTitleStrategy } from '../../../lib/core/import/importedNodeTitle';
import { SettingsControlSlot, SettingsRow, SettingsSection } from '../../shared/ui';

import type { DraftImportSource, DraftImportSourceField } from './importSourceWorkspaceModel';
import { importSourceSelectClassName } from './importSourceWorkspaceModel';
import { ImportSourceTable } from './ImportSourceWorkspaceTable';

function TitleStrategySection(props: {
  onChange: (value: ImportNodeTitleStrategy) => void;
  titleStrategy: ImportNodeTitleStrategy;
}) {
  return (
    <SettingsSection
      ariaLabel="Import title settings"
      className="mb-6"
      description="Imported notes keep the original body unchanged. This only decides which value becomes the note title."
      title="Imported title"
    >
      <SettingsRow
        description="File name is the safer default. Unique level-one heading only applies when the document has exactly one `#` heading."
        title="Title source"
      >
        <SettingsControlSlot>
          <select
            aria-label="Imported title source"
            className={importSourceSelectClassName}
            onChange={(event) => props.onChange(event.target.value as ImportNodeTitleStrategy)}
            value={props.titleStrategy}
          >
            <option value="file_name">File name first</option>
            <option value="heading">Unique level-one heading first</option>
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

  return (
    <div className="space-y-6">
      <TitleStrategySection onChange={props.onChangeTitleStrategy} titleStrategy={props.titleStrategy} />
      <SettingsSection
        ariaLabel="Import management sources"
        description="Restore and adjust the long-running import folders directly here."
        title="Source folders"
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
