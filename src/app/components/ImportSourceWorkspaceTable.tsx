import { CircleHelp, Copy, FolderOpen, X } from 'lucide-react';

import {
  AppButton,
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger
} from '../../shared/ui';

import {
  formatHighlightModeLabel,
  formatSourceActionLabel,
  formatTriggerModeLabel,
  importFrequencyOptions,
  importSourceSelectClassName,
  type DraftImportSource,
  type DraftImportSourceField
} from './importSourceWorkspaceModel';

const rowGridClassName = 'grid grid-cols-[minmax(160px,1.2fr)_minmax(128px,0.9fr)_104px_120px_160px_108px_64px] gap-2';
export const compactHeaderGridClassName = 'grid grid-cols-[minmax(160px,1.2fr)_minmax(128px,0.9fr)_104px_120px_160px_108px_64px] gap-2';

function compactPathLabel(path: string, emptyLabel: string) {
  return path.trim().length > 0 ? path : emptyLabel;
}

function HeaderHelp({ label }: { label: string }) {
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        <button
          aria-label={label}
          className="inline-flex size-4 items-center justify-center rounded-full text-foreground/35 transition-colors hover:text-foreground/70"
          type="button"
        >
          <CircleHelp aria-hidden="true" size={12} strokeWidth={1.8} />
        </button>
      </AppTooltipTrigger>
      <AppTooltipContent>{label}</AppTooltipContent>
    </AppTooltip>
  );
}

function ColumnHeader({ title, help }: { title: string; help?: string }) {
  return (
    <div className="flex items-center gap-1 px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">
      <span>{title}</span>
      {help ? <HeaderHelp label={help} /> : null}
    </div>
  );
}

function FolderButton({
  label,
  path,
  disabled = false,
  onClick
}: {
  label: string;
  path: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <AppButton
      aria-label={label}
      className="h-10 w-full justify-between rounded-md border border-border bg-bg-elevated px-3 text-left text-sm text-foreground/75 disabled:border-border/60 disabled:bg-bg-panel disabled:text-foreground/40"
      disabled={disabled}
      onClick={onClick}
      variant="ghost"
    >
      <span className="truncate">{path}</span>
      <FolderOpen aria-hidden="true" size={14} strokeWidth={1.8} />
    </AppButton>
  );
}

function TriggerCell({
  source,
  onChange
}: {
  source: DraftImportSource;
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
}) {
  if (source.triggerMode !== 'scheduled') {
    return <div className="h-10" />;
  }

  return (
    <select
      aria-label={`Next ${source.id}`}
      className={importSourceSelectClassName}
      onChange={(event) => onChange(source.id, 'frequency', event.target.value)}
      value={source.frequency}
    >
      {importFrequencyOptions.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function ManualActionCell({
  source,
  onRunNow
}: {
  source: DraftImportSource;
  onRunNow: (sourceId: string) => void;
}) {
  if (source.triggerMode !== 'manual') {
    return <div className="h-10" />;
  }

  return (
    <AppButton aria-label={`Import ${source.id}`} className="h-10 w-full whitespace-nowrap" onClick={() => onRunNow(source.id)} variant="subtle">
      Import
    </AppButton>
  );
}

function ActionCell({
  source,
  onChangeAction
}: {
  source: DraftImportSource;
  onChangeAction: (sourceId: string, value: string) => void;
}) {
  return (
    <select
      aria-label={`Source files ${source.id}`}
      className={importSourceSelectClassName}
      onChange={(event) => onChangeAction(source.id, event.target.value)}
      value={source.actionMode}
    >
      <option value="keep">Keep</option>
      <option value="delete">Delete</option>
      <option value="move">{formatSourceActionLabel(source.actionMode, source.archivePath)}</option>
    </select>
  );
}

function RowActions({
  sourceId,
  onCopy,
  onDelete
}: {
  sourceId: string;
  onCopy: (sourceId: string) => void;
  onDelete: (sourceId: string) => void;
}) {
  return (
    <div className="flex h-10 items-center justify-end gap-0.5">
      <AppButton aria-label={`Copy ${sourceId}`} className="size-7 px-0" onClick={() => onCopy(sourceId)} variant="ghost">
        <Copy aria-hidden="true" size={14} strokeWidth={1.8} />
      </AppButton>
      <AppButton aria-label={`Delete ${sourceId}`} className="size-7 px-0" onClick={() => onDelete(sourceId)} variant="ghost">
        <X aria-hidden="true" size={14} strokeWidth={1.8} />
      </AppButton>
    </div>
  );
}

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
    <div className={`${rowGridClassName} items-center border-b border-border/60 py-2`}>
      <FolderButton
        label={`Original folder ${source.id}`}
        onClick={() => onChoosePrimaryFolder(source.id)}
        path={compactPathLabel(source.primaryPath, 'Choose folder')}
      />
      <FolderButton
        label={`Highlight folder ${source.id}`}
        disabled={source.highlightMode !== 'split'}
        onClick={() => onChooseHighlightFolder(source.id)}
        path={compactPathLabel(source.highlightPath, source.highlightMode === 'split' ? 'Choose folder' : 'Not used')}
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
      <ActionCell onChangeAction={onChangeAction} source={source} />
      <ManualActionCell onRunNow={onRunNow} source={source} />
      <RowActions onCopy={onCopySource} onDelete={onDeleteSource} sourceId={source.id} />
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
    <div className="min-w-[1080px]">
      <div className={compactHeaderGridClassName}>
        <ColumnHeader title="Original folder" />
        <ColumnHeader title="Highlight folder" />
        <ColumnHeader title="Mode" />
        <ColumnHeader help="Choose how this source starts: run it yourself, or let it run on a schedule." title="Trigger" />
        <ColumnHeader help="Keep leaves files where they are. Delete removes them. Move lets you choose a destination folder." title="Handling" />
        <ColumnHeader help="Scheduled shows a repeat interval." title="Next" />
        <ColumnHeader title="Actions" />
      </div>
      <div className="mt-2 flex flex-col">
        {sources.map((source) => (
          <SourceRow
            key={source.id}
            onChange={onChange}
            onChooseHighlightFolder={onChooseHighlightFolder}
            onChoosePrimaryFolder={onChoosePrimaryFolder}
            onChangeAction={onChangeAction}
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
