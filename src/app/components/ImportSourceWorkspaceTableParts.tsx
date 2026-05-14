import { FolderOpen, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { importActionOptions } from '../../../lib/core/import/importSourceActions';
import { definedProps } from '../../shared/lib/definedProps';
import { cn } from '../../shared/lib/utils';
import { AppButton } from '../../shared/ui';

import {
  formatHighlightModeLabel,
  importSourceSelectClassName,
  type DraftImportSource
} from './importSourceWorkspaceModel';

function compactPathLabel(path: string, emptyLabel: string) {
  if (path.trim().length === 0) {
    return emptyLabel;
  }
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function resolveFolderPathTooltip(path: string) {
  return path.trim().length > 0 ? path : undefined;
}

function SourceField({
  children,
  label
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/45">{label}</span>
      {children}
    </label>
  );
}

export function HighlightModeSelect({
  source,
  onChange
}: {
  source: DraftImportSource;
  onChange: (sourceId: string, value: string) => void;
}) {
  return (
    <SourceField label="Mode">
      <select
        aria-label={`Mode ${source.id}`}
        className={importSourceSelectClassName}
        onChange={(event) => onChange(source.id, event.target.value)}
        value={source.highlightMode}
      >
        <option value="merged">{formatHighlightModeLabel('merged')}</option>
        <option value="split">{formatHighlightModeLabel('split')}</option>
      </select>
    </SourceField>
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
    <SourceField label="Handling">
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
    </SourceField>
  );
}

function KeepToggle({
  checked,
  label,
  onClick
}: {
  checked: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
        checked ? 'border-foreground/20 bg-foreground/85' : 'border-border bg-bg-panel'
      }`}
      onClick={onClick}
      role="switch"
      type="button"
    >
      <span
        className={`inline-block size-5 rounded-full bg-white shadow-marker transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

export function FolderButton({
  label,
  path,
  tooltip,
  disabled = false,
  onClick,
  className
}: {
  label: string;
  path: string;
  tooltip?: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <AppButton
      aria-label={label}
      className={cn(
        'h-10 w-full min-w-0 justify-between rounded-md border border-settings-control-border bg-settings-control px-3 text-left text-sm text-foreground/75 disabled:border-settings-control-border disabled:bg-settings-switch-off disabled:text-foreground/40',
        className
      )}
      disabled={disabled}
      onClick={onClick}
      title={disabled ? undefined : tooltip}
      variant="ghost"
    >
      <span className="min-w-0 truncate">{path}</span>
      <FolderOpen aria-hidden="true" className="shrink-0 text-settings-icon" size={13} strokeWidth={1.8} />
    </AppButton>
  );
}

export function ImportSourceControlGrid({
  onChangeMode,
  onChangeAction,
  onChooseHighlightFolder,
  onChoosePrimaryFolder,
  source
}: {
  onChangeAction: (sourceId: string, value: string) => void;
  onChangeMode: (sourceId: string, value: string) => void;
  onChooseHighlightFolder: (sourceId: string) => void;
  onChoosePrimaryFolder: (sourceId: string) => void;
  source: DraftImportSource;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_140px_140px]">
      <SourceField label="Original folder">
        <FolderButton
          label={`Original folder ${source.id}`}
          onClick={() => onChoosePrimaryFolder(source.id)}
          path={resolveFolderPathLabel(source.primaryPath, 'Choose folder')}
          {...definedProps({ tooltip: resolveFolderPathHint(source.primaryPath) })}
        />
      </SourceField>
      <SourceField label="Highlight folder">
        <FolderButton
          label={`Highlight folder ${source.id}`}
          disabled={source.highlightMode !== 'split'}
          onClick={() => onChooseHighlightFolder(source.id)}
          path={resolveFolderPathLabel(source.highlightPath, source.highlightMode === 'split' ? 'Choose folder' : 'Not used')}
          {...definedProps({ tooltip: resolveFolderPathHint(source.highlightPath) })}
        />
      </SourceField>
      <HighlightModeSelect onChange={onChangeMode} source={source} />
      <HandlingCell onChangeAction={onChangeAction} source={source} />
    </div>
  );
}

export function KeepActionCell({
  source,
  onDelete,
  onDisable,
  onPreview
}: {
  source: DraftImportSource;
  onDelete?: (sourceId: string) => void;
  onDisable?: (sourceId: string) => void;
  onPreview: (sourceId: string) => void;
}) {
  const keepEnabled = source.keepState === 'enabled';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/45">Keep import</span>
        {keepEnabled ? (
          <KeepToggle checked label={`Keep import enabled ${source.id}`} onClick={() => onDisable?.(source.id)} />
        ) : (
          <AppButton
            aria-label={`Preview ${source.id}`}
            className="h-9 min-w-24 whitespace-nowrap px-3"
            disabled={!source.primaryPath.trim()}
            onClick={() => onPreview(source.id)}
            variant="primary"
          >
            Preview
          </AppButton>
        )}
      </div>
      <div className="flex items-center gap-1">
        {onDelete ? (
          <AppButton aria-label={`Delete ${source.id}`} className="size-9 px-0 text-settings-icon hover:text-settings-icon-hover" onClick={() => onDelete(source.id)} variant="ghost">
            <Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />
          </AppButton>
        ) : null}
      </div>
    </div>
  );
}

export function resolveFolderPathLabel(path: string, emptyLabel: string) {
  return compactPathLabel(path, emptyLabel);
}

export function resolveFolderPathHint(path: string) {
  return resolveFolderPathTooltip(path);
}
