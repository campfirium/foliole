import { AppListItem } from '../../shared/ui';

import {
  type DraftImportSource,
  type DraftImportSourceField
} from './importSourceWorkspaceModel';
import {
  ImportSourceControlGrid,
  KeepActionCell,
} from './ImportSourceWorkspaceTableParts';
import {
  buildImportSourceMeta,
  buildImportSourceSummary,
  buildImportSourceTitle,
  ImportSourceStatusRow
} from './ImportSourceWorkspaceTablePresentation';

function SourceRow({
  source,
  onChange,
  onChoosePrimaryFolder,
  onChooseHighlightFolder,
  onChangeAction,
  onDisableKeepImport,
  onCopySource,
  onDeleteSource,
  onPreviewKeepImport
}: {
  source: DraftImportSource;
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChangeAction: (sourceId: string, value: string) => void;
  onDisableKeepImport: (sourceId: string) => void;
  onCopySource: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  onPreviewKeepImport: (sourceId: string) => void;
}) {
  return (
    <AppListItem
      actionsSeparated={false}
      actions={
        <div className="space-y-4">
          <ImportSourceStatusRow source={source} />
          <ImportSourceControlGrid
            onChangeAction={onChangeAction}
            onChangeMode={(sourceId, value) => onChange(sourceId, 'highlightMode', value)}
            onChooseHighlightFolder={onChooseHighlightFolder}
            onChoosePrimaryFolder={onChoosePrimaryFolder}
            source={source}
          />
          <KeepActionCell
            onCopy={onCopySource}
            onDelete={onDeleteSource}
            onDisable={onDisableKeepImport}
            onPreview={onPreviewKeepImport}
            source={source}
          />
        </div>
      }
      className="gap-4 py-5"
      divided={false}
      interactive={false}
      meta={buildImportSourceMeta(source)}
      metaAfterSummary
      summary={buildImportSourceSummary(source)}
      title={buildImportSourceTitle(source)}
    />
  );
}

export function ImportSourceTable({
  sources,
  onChange,
  onChoosePrimaryFolder,
  onChooseHighlightFolder,
  onChangeAction,
  onDisableKeepImport,
  onCopySource,
  onDeleteSource,
  onPreviewKeepImport
}: {
  sources: DraftImportSource[];
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChangeAction: (sourceId: string, value: string) => void;
  onDisableKeepImport: (sourceId: string) => void;
  onCopySource: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  onPreviewKeepImport: (sourceId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {sources.map((source) => (
        <SourceRow
          key={source.id}
          onChange={onChange}
          onChangeAction={onChangeAction}
          onChooseHighlightFolder={onChooseHighlightFolder}
          onChoosePrimaryFolder={onChoosePrimaryFolder}
          onDisableKeepImport={onDisableKeepImport}
          onCopySource={onCopySource}
          onDeleteSource={onDeleteSource}
          onPreviewKeepImport={onPreviewKeepImport}
          source={source}
        />
      ))}
    </div>
  );
}
