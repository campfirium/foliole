import { Copy, FolderOpen, X } from 'lucide-react';

import { AppButton } from '../../shared/ui';

import { type DraftImportSource } from './importSourceWorkspaceModel';

export const rowGridClassName =
  'grid grid-cols-[minmax(118px,0.9fr)_minmax(118px,0.9fr)_92px_minmax(180px,0.72fr)] gap-2';

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

export function ColumnHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-1 px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/45">
      <span>{title}</span>
    </div>
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
    <div className="flex h-full items-center justify-end gap-1">
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
  );
}

export function resolveFolderPathLabel(path: string, emptyLabel: string) {
  return compactPathLabel(path, emptyLabel);
}

export function resolveFolderPathHint(path: string) {
  return resolveFolderPathTooltip(path);
}
