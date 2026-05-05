import {
  formatHighlightModeLabel,
  importSourceSelectClassName,
  type DraftImportSource,
  type DraftImportSourceField
} from './importSourceWorkspaceModel';
import {
  ColumnHeader,
  FolderButton,
  HandlingCell,
  KeepActionCell,
  resolveFolderPathHint,
  resolveFolderPathLabel,
  rowGridClassName
} from './ImportSourceWorkspaceTableParts';

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
    <div className={`${rowGridClassName} items-start border-b border-border/60 py-2`}>
      <FolderButton
        label={`Original folder ${source.id}`}
        onClick={() => onChoosePrimaryFolder(source.id)}
        path={resolveFolderPathLabel(source.primaryPath, 'Choose folder')}
        tooltip={resolveFolderPathHint(source.primaryPath)}
      />
      <FolderButton
        label={`Highlight folder ${source.id}`}
        disabled={source.highlightMode !== 'split'}
        onClick={() => onChooseHighlightFolder(source.id)}
        path={resolveFolderPathLabel(source.highlightPath, source.highlightMode === 'split' ? 'Choose folder' : 'Not used')}
        tooltip={resolveFolderPathHint(source.highlightPath)}
      />
      <select
        aria-label={`Mode ${source.id}`}
        className={importSourceSelectClassName}
        onChange={(event) => onChange(source.id, 'highlightMode', event.target.value)}
        value={source.highlightMode}
      >
        <option value="merged">{formatHighlightModeLabel('merged')}</option>
        <option value="split">{formatHighlightModeLabel('split')}</option>
      </select>
      <HandlingCell onChangeAction={onChangeAction} source={source} />
      <KeepActionCell onCopy={onCopySource} onDelete={onDeleteSource} onDisable={onDisableKeepImport} onPreview={onPreviewKeepImport} source={source} />
    </div>
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
    <div className="min-w-[920px]">
      <div className={rowGridClassName}>
        <ColumnHeader title="Original" />
        <ColumnHeader title="Highlight" />
        <ColumnHeader title="Mode" />
        <ColumnHeader title="Handling" />
        <ColumnHeader title="" />
      </div>
      <div className="mt-2 flex flex-col">
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
    </div>
  );
}
