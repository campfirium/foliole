import { CircleHelp, Copy, FolderOpen, X } from 'lucide-react';

import { AppButton, AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../shared/ui';

import {
  importActionOptions,
  importFrequencyOptions,
  importSourceSelectClassName,
  type DraftImportSource,
  type DraftImportSourceField
} from './importSourceWorkspaceModel';

export const rowGridClassName =
  'grid grid-cols-[minmax(118px,0.72fr)_minmax(118px,0.72fr)_92px_110px_108px_96px_168px] gap-2';

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

export function ColumnHeader({ title, help }: { title: string; help?: string }) {
  return (
    <div className="flex items-center gap-1 px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">
      <span>{title}</span>
      {help ? <HeaderHelp label={help} /> : null}
    </div>
  );
}

export function FolderButton({
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

export function TriggerCell({
  source,
  onChange
}: {
  source: DraftImportSource;
  onChange: (sourceId: string, field: DraftImportSourceField, value: string) => void;
}) {
  if (source.triggerMode !== 'scheduled') {
    return (
      <div className="flex h-10 items-center rounded-md border border-border/70 bg-bg-panel px-3 text-sm text-foreground/45">
        On import
      </div>
    );
  }

  return (
    <select
      aria-label={`Every ${source.id}`}
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

export function HandlingCell({
  source,
  onChangeAction
}: {
  source: DraftImportSource;
  onChangeAction: (sourceId: string, value: string) => void;
}) {
  return (
    <select
      aria-label={`Handling ${source.id}`}
      className={importSourceSelectClassName}
      onChange={(event) => onChangeAction(source.id, event.target.value)}
      value={source.actionMode}
    >
      {importActionOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function RowActions({
  source,
  onCopy,
  onDelete,
  onRunNow
}: {
  source: DraftImportSource;
  onCopy: (sourceId: string) => void;
  onDelete: (sourceId: string) => void;
  onRunNow: (sourceId: string) => void;
}) {
  return (
    <div className="flex h-full items-center justify-end gap-1">
      <AppButton aria-label={`Import ${source.id}`} className="h-9 min-w-16 whitespace-nowrap px-3" onClick={() => onRunNow(source.id)} variant="primary">
        Import
      </AppButton>
      <AppButton aria-label={`Copy ${source.id}`} className="size-8 px-0" onClick={() => onCopy(source.id)} variant="ghost">
        <Copy aria-hidden="true" size={14} strokeWidth={1.8} />
      </AppButton>
      <AppButton aria-label={`Delete ${source.id}`} className="size-8 px-0" onClick={() => onDelete(source.id)} variant="ghost">
        <X aria-hidden="true" size={14} strokeWidth={1.8} />
      </AppButton>
    </div>
  );
}

export function resolveFolderPathLabel(path: string, emptyLabel: string) {
  return compactPathLabel(path, emptyLabel);
}
