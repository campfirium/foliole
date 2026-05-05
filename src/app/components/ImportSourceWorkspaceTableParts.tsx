import { Copy, FolderOpen, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { importActionOptions } from '../../../lib/core/import/importSourceActions';
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
        className={`inline-block size-5 rounded-full bg-white shadow-sm transition-transform ${
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
  onClick
}: {
  label: string;
  path: string;
  tooltip?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <AppButton
      aria-label={label}
      className="h-10 w-full justify-between rounded-md border border-border bg-bg-elevated px-3 text-left text-sm text-foreground/75 disabled:border-border/60 disabled:bg-bg-panel disabled:text-foreground/40"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? undefined : tooltip}
      variant="ghost"
    >
      <span className="truncate">{path}</span>
      <FolderOpen aria-hidden="true" size={14} strokeWidth={1.8} />
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
          tooltip={resolveFolderPathHint(source.primaryPath)}
        />
      </SourceField>
      <SourceField label="Highlight folder">
        <FolderButton
          label={`Highlight folder ${source.id}`}
          disabled={source.highlightMode !== 'split'}
          onClick={() => onChooseHighlightFolder(source.id)}
          path={resolveFolderPathLabel(source.highlightPath, source.highlightMode === 'split' ? 'Choose folder' : 'Not used')}
          tooltip={resolveFolderPathHint(source.highlightPath)}
        />
      </SourceField>
      <HighlightModeSelect onChange={onChangeMode} source={source} />
      <HandlingCell onChangeAction={onChangeAction} source={source} />
    </div>
  );
}

export function KeepActionCell({
  source,
  onCopy,
  onDelete,
  onDisable,
  onPreview
}: {
  source: DraftImportSource;
  onCopy?: (sourceId: string) => void;
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
        {onCopy ? (
          <AppButton aria-label={`Copy ${source.id}`} className="size-8 px-0" onClick={() => onCopy(source.id)} variant="ghost">
            <Copy aria-hidden="true" size={14} strokeWidth={1.8} />
          </AppButton>
        ) : null}
        {onDelete ? (
          <AppButton aria-label={`Delete ${source.id}`} className="size-8 px-0" onClick={() => onDelete(source.id)} variant="ghost">
            <X aria-hidden="true" size={14} strokeWidth={1.8} />
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
