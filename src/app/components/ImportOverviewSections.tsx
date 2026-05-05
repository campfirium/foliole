import type { Node } from '../../features/nodes/model/nodeTypes';
import type { RuntimeTextImportResult } from '../../shared/platform/importBridge';
import { AppButton, AppStatusBadge, InspectorSection } from '../../shared/ui';

function formatImportTime(timestamp: string) {
  return timestamp.replace('T', ' ').slice(0, 16);
}

function formatImportOutcome(entry: RuntimeTextImportResult) {
  if (entry.resultStatus === 'failed') {
    return `Failed ${entry.sourceName}`;
  }
  if (entry.resultStatus === 'degraded') {
    return `Degraded ${entry.sourceName}`;
  }
  if (entry.duplicateSemantic === 'duplicate') {
    return `Reused ${entry.sourceName}`;
  }
  if (entry.duplicateSemantic === 'updated') {
    return `Updated ${entry.sourceName}`;
  }
  return `Imported ${entry.sourceName}`;
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

function resolveDetail(entry: RuntimeTextImportResult) {
  if (entry.resultStatus === 'failed') {
    return entry.failureReason ?? 'Unknown import failure';
  }
  if (entry.resultStatus === 'degraded') {
    return entry.degradedReason ?? 'Import degraded';
  }
  return `${entry.sourceKind} · ${entry.sourceLocator}`;
}

export function ImportRunSection({
  emptyLabel,
  entry,
  title
}: {
  emptyLabel: string;
  entry: RuntimeTextImportResult | null;
  title: string;
}) {
  return (
    <InspectorSection title={title}>
      {entry ? (
        <div className="rounded-lg border border-border bg-bg-panel px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{formatImportOutcome(entry)}</p>
              <p className="mt-1 text-xs text-foreground/50">{formatImportTime(entry.importedAt)}</p>
              <p className="mt-2 break-all text-sm text-foreground/65">{resolveDetail(entry)}</p>
            </div>
            <AppStatusBadge label={entry.resultStatus} tone={resolveTone(entry)} />
          </div>
          <dl className="mt-3 space-y-2 text-sm text-foreground/70">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-foreground/45">Source</dt>
              <dd className="text-right">{entry.sourceName}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="text-sm text-foreground/65">{emptyLabel}</p>
      )}
    </InspectorSection>
  );
}

function collectRecentInboxEntries(entries: RuntimeTextImportResult[]) {
  const seenNodeIds = new Set<string>();
  return entries.filter((entry) => {
    if (!entry.nodeId || seenNodeIds.has(entry.nodeId)) {
      return false;
    }
    seenNodeIds.add(entry.nodeId);
    return true;
  });
}

export function InboxImportedNodesSection({
  entries,
  nodesById,
  onOpenNode
}: {
  entries: RuntimeTextImportResult[];
  nodesById: Record<string, Node>;
  onOpenNode: (nodeId: string) => void;
}) {
  const recentNodes = collectRecentInboxEntries(entries);

  return (
    <InspectorSection
      description="Recent imports stay reachable from Inbox before you sort them into the main tree."
      title="Imported nodes"
    >
      {recentNodes.length > 0 ? (
        <div className="flex flex-col gap-3">
          {recentNodes.map((entry) => {
            const node = entry.nodeId ? nodesById[entry.nodeId] : undefined;
            if (!node || !entry.nodeId) {
              return null;
            }

            return (
              <div className="rounded-lg border border-border bg-bg-panel px-3 py-3" key={entry.importId}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{node.title}</p>
                    <p className="mt-1 text-xs text-foreground/50">{formatImportTime(entry.importedAt)}</p>
                    <p className="mt-2 break-all text-sm text-foreground/65">{entry.sourceKind} · {entry.sourceLocator}</p>
                  </div>
                  <AppStatusBadge label={entry.resultStatus} tone={resolveTone(entry)} />
                </div>
                <div className="mt-3 flex items-center justify-end gap-3">
                  <AppButton onClick={() => onOpenNode(entry.nodeId!)} variant="ghost">
                    Open node
                  </AppButton>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-foreground/65">No imported Inbox children yet.</p>
      )}
    </InspectorSection>
  );
}
