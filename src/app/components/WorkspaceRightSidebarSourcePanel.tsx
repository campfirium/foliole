import type { RuntimeKeepImportItemDetails, RuntimeNodeImportSource, RuntimeTextImportResult } from '../../shared/platform/importBridge';
import { AppStatusBadge, InspectorSection } from '../../shared/ui';

import { useNodeSourceDetails } from './useNodeSourceDetails';

interface WorkspaceRightSidebarSourcePanelProps {
  activeNodeId: string | null;
  hasActiveNode: boolean;
}

function formatImportTime(timestamp: string) {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) {
    return timestamp;
  }
  return value.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatImportOutcome(entry: RuntimeTextImportResult) {
  if (entry.resultStatus === 'failed') {
    return 'Failed';
  }
  if (entry.resultStatus === 'degraded') {
    return 'Imported with issues';
  }
  if (entry.duplicateSemantic === 'duplicate') {
    return 'Reused existing node';
  }
  if (entry.duplicateSemantic === 'updated') {
    return 'Updated existing node';
  }
  return 'Imported as new node';
}

function resolveTone(entry: RuntimeTextImportResult) {
  if (entry.resultStatus === 'failed') {
    return 'error' as const;
  }
  if (entry.resultStatus === 'degraded') {
    return 'warning' as const;
  }
  return 'info' as const;
}

function resolveImportMessage(entry: RuntimeTextImportResult) {
  if (entry.resultStatus === 'failed') {
    return entry.failureReason ?? 'Import failed without a recorded reason.';
  }
  if (entry.resultStatus === 'degraded') {
    return entry.degradedReason ?? 'Import completed with degraded content.';
  }
  return `${entry.sourceKind} · ${entry.sourceLocator}`;
}

function SourceInfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-foreground/55">{label}</dt>
      <dd className={`min-w-0 break-all text-right text-foreground ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</dd>
    </>
  );
}

function EmptySourceInfoState({ description }: { description: string }) {
  return <InspectorSection description={description} title="Source info" />;
}

function SourceSummarySection({ entries }: { entries: RuntimeTextImportResult[] }) {
  const importedCount = entries.filter((entry) => entry.resultStatus === 'imported').length;
  const degradedCount = entries.filter((entry) => entry.resultStatus === 'degraded').length;
  const failedCount = entries.filter((entry) => entry.resultStatus === 'failed').length;

  return (
    <InspectorSection title="Import summary">
      <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-md bg-bg-elevated px-2 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/60">Imported</dt>
          <dd className="mt-1 text-base font-semibold text-foreground">{importedCount}</dd>
        </div>
        <div className="rounded-md bg-bg-elevated px-2 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/60">Issues</dt>
          <dd className="mt-1 text-base font-semibold text-foreground">{degradedCount}</dd>
        </div>
        <div className="rounded-md bg-bg-elevated px-2 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/60">Failed</dt>
          <dd className="mt-1 text-base font-semibold text-foreground">{failedCount}</dd>
        </div>
      </dl>
    </InspectorSection>
  );
}

function SourceRegistrySection({ importSource }: { importSource: RuntimeNodeImportSource }) {
  return (
    <InspectorSection title="Stored source">
      <dl className="grid grid-cols-[minmax(88px,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
        <SourceInfoRow label="Name" value={importSource.sourceName} />
        <SourceInfoRow label="Kind" value={importSource.sourceKind} />
        <SourceInfoRow label="Path" value={importSource.sourceLocator} />
        <SourceInfoRow label="First import" value={formatImportTime(importSource.firstImportedAt)} />
        <SourceInfoRow label="Last import" value={formatImportTime(importSource.lastImportedAt)} />
        <SourceInfoRow label="Source ID" value={importSource.sourceFingerprint} mono />
      </dl>
    </InspectorSection>
  );
}

function KeepImportSection({ item }: { item: RuntimeKeepImportItemDetails }) {
  return (
    <InspectorSection title="Tracked source">
      <dl className="grid grid-cols-[minmax(88px,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
        <SourceInfoRow label="Rule" value={item.ruleLabel ?? item.ruleId} />
        <SourceInfoRow label="Type" value={item.sourceType ?? 'Unknown'} />
        <SourceInfoRow label="Status" value={item.lastStatus} />
        <SourceInfoRow label="File path" value={item.sourcePath} />
        <SourceInfoRow label="Main folder" value={item.primaryPath ?? 'Not recorded'} />
        <SourceInfoRow label="Highlights" value={item.highlightPath ?? 'Not recorded'} />
        <SourceInfoRow label="First seen" value={formatImportTime(item.firstSeenAt)} />
        <SourceInfoRow label="Last seen" value={formatImportTime(item.lastSeenAt)} />
        <SourceInfoRow label="Last import" value={item.lastImportedAt ? formatImportTime(item.lastImportedAt) : 'Never'} />
      </dl>
    </InspectorSection>
  );
}

function LatestImportRunSection({ entry }: { entry: RuntimeTextImportResult }) {
  return (
    <InspectorSection title="Latest import">
      <div className="rounded-lg border border-border bg-bg-panel px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{entry.sourceName}</p>
            <p className="mt-1 text-xs text-foreground/50">{formatImportTime(entry.importedAt)}</p>
            <p className="mt-2 break-all text-sm text-foreground/65">{resolveImportMessage(entry)}</p>
          </div>
          <AppStatusBadge label={entry.resultStatus} tone={resolveTone(entry)} />
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-[minmax(88px,auto)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
        <SourceInfoRow label="Outcome" value={formatImportOutcome(entry)} />
        <SourceInfoRow label="Kind" value={entry.sourceKind} />
        <SourceInfoRow label="Imported" value={formatImportTime(entry.importedAt)} />
        <SourceInfoRow label="Import ID" value={entry.importId} mono />
      </dl>
    </InspectorSection>
  );
}

function SourceHistorySection({ entries }: { entries: RuntimeTextImportResult[] }) {
  return (
    <InspectorSection className="p-2" title="Import history">
      <ol aria-label="Node import history" className="flex flex-col gap-1">
        {entries.map((entry, index) => (
          <li className="rounded-md border border-border/80 px-3 py-3" key={entry.importId}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {index + 1}. {entry.sourceName}
                </p>
                <p className="mt-1 text-[12px] text-foreground/60">{formatImportOutcome(entry)}</p>
                <p className="mt-1 break-all text-[12px] text-foreground/45">{resolveImportMessage(entry)}</p>
              </div>
              <span className="shrink-0 text-[11px] font-medium text-foreground/45">{formatImportTime(entry.importedAt)}</span>
            </div>
          </li>
        ))}
      </ol>
    </InspectorSection>
  );
}

export function WorkspaceRightSidebarSourcePanel(props: WorkspaceRightSidebarSourcePanelProps) {
  const details = useNodeSourceDetails(props.hasActiveNode ? props.activeNodeId : null);

  if (!props.activeNodeId) {
    return <EmptySourceInfoState description="Select a node to inspect its import source and history." />;
  }
  if (!props.hasActiveNode) {
    return null;
  }
  if (details.isLoading && !details.value) {
    return <EmptySourceInfoState description="Loading source info..." />;
  }
  if (!details.value) {
    return <EmptySourceInfoState description="This node has no recorded import source yet." />;
  }
  const { importRuns, importSource, inheritedFromParent, keepImportItem } = details.value;
  if (!importSource && !keepImportItem && importRuns.length === 0) {
    return <EmptySourceInfoState description="This node has no recorded import source yet." />;
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {inheritedFromParent ? (
        <InspectorSection title="Source link">
          <p className="text-sm leading-6 text-foreground/70">
            This node is attached to an imported parent note, so the source details below come from that parent.
          </p>
        </InspectorSection>
      ) : null}
      {importRuns.length > 0 ? <SourceSummarySection entries={importRuns} /> : null}
      {importSource ? <SourceRegistrySection importSource={importSource} /> : null}
      {keepImportItem ? <KeepImportSection item={keepImportItem} /> : null}
      {importRuns[0] ? <LatestImportRunSection entry={importRuns[0]} /> : null}
      {importRuns.length > 0 ? <SourceHistorySection entries={importRuns} /> : null}
    </div>
  );
}
