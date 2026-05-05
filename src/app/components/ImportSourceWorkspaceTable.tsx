import {
  formatHighlightModeLabel,
  formatTriggerModeLabel,
  importSourceSelectClassName,
  type DraftImportSource,
  type DraftImportSourceField
} from './importSourceWorkspaceModel';
import {
  ColumnHeader,
  FolderButton,
  HandlingCell,
  resolveFolderPathLabel,
  RowActions,
  rowGridClassName,
  TriggerCell
} from './ImportSourceWorkspaceTableParts';

function SourceRow({
  source,
  onChange,
  onChoosePrimaryFolder,
  onChooseHighlightFolder,
  onChangeAction,
  onCopySource,
  onDeleteSource,
  onRunNow
}: {
  source: DraftImportSource;
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChangeAction: (sourceId: string, value: string) => void;
  onCopySource: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  onRunNow: (sourceId: string) => void;
}) {
  return (
    <div className={`${rowGridClassName} items-start border-b border-border/60 py-2`}>
      <FolderButton
        label={`Original folder ${source.id}`}
        onClick={() => onChoosePrimaryFolder(source.id)}
        path={resolveFolderPathLabel(source.primaryPath, 'Choose folder')}
      />
      <FolderButton
        label={`Highlight folder ${source.id}`}
        disabled={source.highlightMode !== 'split'}
        onClick={() => onChooseHighlightFolder(source.id)}
        path={resolveFolderPathLabel(source.highlightPath, source.highlightMode === 'split' ? 'Choose folder' : 'Not used')}
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
      <select
        aria-label={`Trigger ${source.id}`}
        className={importSourceSelectClassName}
        onChange={(event) => onChange(source.id, 'triggerMode', event.target.value)}
        value={source.triggerMode}
      >
        <option value="manual">{formatTriggerModeLabel('manual')}</option>
        <option value="scheduled">{formatTriggerModeLabel('scheduled')}</option>
      </select>
      <TriggerCell onChange={onChange} source={source} />
      <RowActions onCopy={onCopySource} onDelete={onDeleteSource} onRunNow={onRunNow} source={source} />
    </div>
  );
}

export function ImportSourceTable({
  sources,
  onChange,
  onChoosePrimaryFolder,
  onChooseHighlightFolder,
  onChangeAction,
  onCopySource,
  onDeleteSource,
  onRunNow
}: {
  sources: DraftImportSource[];
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChangeAction: (sourceId: string, value: string) => void;
  onCopySource: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  onRunNow: (sourceId: string) => void;
}) {
  return (
    <div className="min-w-[920px]">
      <div className={rowGridClassName}>
        <ColumnHeader title="Original" />
        <ColumnHeader title="Highlight" />
        <ColumnHeader title="Mode" />
        <ColumnHeader help="After import" title="Handling" />
        <ColumnHeader help="When it runs" title="Trigger" />
        <ColumnHeader help="Repeat" title="Every" />
        <ColumnHeader title="Actions" />
      </div>
      <div className="mt-2 flex flex-col">
        {sources.map((source) => (
          <SourceRow
            key={source.id}
            onChange={onChange}
            onChangeAction={onChangeAction}
            onChooseHighlightFolder={onChooseHighlightFolder}
            onChoosePrimaryFolder={onChoosePrimaryFolder}
            onCopySource={onCopySource}
            onDeleteSource={onDeleteSource}
            onRunNow={onRunNow}
            source={source}
          />
        ))}
      </div>
    </div>
  );
}
