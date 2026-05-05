import { importActionOptions } from '../../../lib/core/import/importSourceActions';
import { AppStatusBadge } from '../../shared/ui';

import {
  formatHighlightModeLabel,
  formatKeepStateLabel,
  type DraftImportSource
} from './importSourceWorkspaceModel';
import { resolveFolderPathLabel } from './ImportSourceWorkspaceTableParts';

function resolveSourceDraftLabel(source: DraftImportSource) {
  const match = source.id.match(/(\d+)$/);
  return match ? `Source ${match[1]}` : 'Source folder';
}

function resolveSourcePrimaryLabel(source: DraftImportSource) {
  return resolveFolderPathLabel(source.primaryPath, resolveSourceDraftLabel(source));
}

function buildSourceMetaLine(label: string, value: string) {
  return (
    <div className="flex flex-wrap items-start gap-x-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/45">{label}</span>
      <span className="min-w-0 flex-1 break-all text-[13px] leading-5 text-foreground/56">{value}</span>
    </div>
  );
}

function resolveKeepTone(state: DraftImportSource['keepState']) {
  if (state === 'enabled') {
    return 'success' as const;
  }
  if (state === 'previewed') {
    return 'warning' as const;
  }
  return 'neutral' as const;
}

export function buildImportSourceTitle(source: DraftImportSource) {
  return <span className="line-clamp-2 block text-[17px] leading-7 text-foreground">{resolveSourcePrimaryLabel(source)}</span>;
}

export function buildImportSourceSummary(source: DraftImportSource) {
  if (!source.primaryPath.trim()) {
    return 'Choose the original folder first, then adjust how imported files and highlights should be handled.';
  }

  const highlightCopy =
    source.highlightMode === 'split'
      ? source.highlightPath.trim()
        ? 'Highlights go to a separate folder.'
        : 'Choose a separate highlights folder.'
      : 'Highlights stay with the original file.';
  const keepCopy = source.keepState === 'enabled' ? 'Keep import is live.' : 'Keep import is not live yet.';
  return `${highlightCopy} ${keepCopy}`;
}

export function buildImportSourceMeta(source: DraftImportSource) {
  const highlightPath =
    source.highlightMode === 'split'
      ? source.highlightPath.trim() || 'Choose folder'
      : 'Not used while highlights stay merged';

  return (
    <div className="space-y-1">
      {buildSourceMetaLine('Original', source.primaryPath.trim() || 'Choose folder')}
      {buildSourceMetaLine('Highlight', highlightPath)}
    </div>
  );
}

export function ImportSourceStatusRow({ source }: { source: DraftImportSource }) {
  return (
    <div className="flex flex-wrap gap-2">
      <AppStatusBadge label={formatHighlightModeLabel(source.highlightMode)} tone="info" />
      <AppStatusBadge
        label={importActionOptions.find((option) => option.value === source.actionMode)?.label ?? 'Keep'}
        tone="neutral"
      />
      <AppStatusBadge label={formatKeepStateLabel(source.keepState)} tone={resolveKeepTone(source.keepState)} />
    </div>
  );
}
