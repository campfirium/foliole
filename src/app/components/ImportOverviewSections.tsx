import type { Node } from '../../features/nodes/model/nodeTypes';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import type { RuntimeTextImportResult } from '../../shared/platform/importExecutionRuntimeRepository';
import { AppButton, AppStatusBadge } from '../../shared/ui';

import { ImportCatalogListItem } from './ImportCatalogListItem';
import { renderImportDate, renderImportMeta, renderImportOpening, renderImportTitle } from './ImportNodeListBits';
import {
  buildImportNodePresentation
} from './importNodePresentation';

export function formatImportTime(timestamp: string) {
  return timestamp.replace('T', ' ').slice(0, 16);
}

type ImportTranslate = ReturnType<typeof useTranslation>;

function formatImportOutcome(entry: RuntimeTextImportResult, t: ImportTranslate) {
  if (entry.resultStatus === 'failed') {
    return t('desktop.importOverview.outcome.failed', { name: entry.sourceName });
  }
  if (entry.resultStatus === 'degraded') {
    return t('desktop.importOverview.outcome.degraded', { name: entry.sourceName });
  }
  if (entry.duplicateSemantic === 'duplicate') {
    return t('desktop.importOverview.outcome.reused', { name: entry.sourceName });
  }
  if (entry.duplicateSemantic === 'updated') {
    return t('desktop.importOverview.outcome.updated', { name: entry.sourceName });
  }
  return t('desktop.importOverview.outcome.imported', { name: entry.sourceName });
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

function resolveDetail(entry: RuntimeTextImportResult, t: ImportTranslate) {
  if (entry.resultStatus === 'failed') {
    return entry.failureReason ?? t('desktop.importOverview.unknownFailure');
  }
  if (entry.resultStatus === 'degraded') {
    return entry.degradedReason ?? t('desktop.importOverview.importDegraded');
  }
  return `${entry.sourceKind} · ${entry.sourceLocator}`;
}

export function collectRecentInboxEntries(entries: RuntimeTextImportResult[]) {
  const seenNodeIds = new Set<string>();
  return entries.filter((entry) => {
    if (!entry.nodeId || seenNodeIds.has(entry.nodeId)) {
      return false;
    }
    seenNodeIds.add(entry.nodeId);
    return true;
  });
}

function renderImportActions(input: {
  canOpenNode?: boolean;
  nodeId?: string | null;
  onOpenNode: (nodeId: string) => void;
  openTopicLabel: string;
  status: RuntimeTextImportResult['resultStatus'];
  tone: ReturnType<typeof resolveTone>;
}) {
  const openNodeId = input.canOpenNode ? (input.nodeId ?? null) : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        <AppStatusBadge label={input.status} tone={input.tone} />
      </div>
      {openNodeId ? (
        <AppButton onClick={() => input.onOpenNode(openNodeId)} variant="ghost">
          {input.openTopicLabel}
        </AppButton>
      ) : null}
    </div>
  );
}

function buildRunPresentation(entry: RuntimeTextImportResult, nodesById: Record<string, Node>, t: ImportTranslate) {
  return buildImportNodePresentation({
    fallbackDate: formatImportTime(entry.importedAt),
    fallbackOpening: resolveDetail(entry, t),
    fallbackPath: entry.sourceLocator,
    fallbackTitle: entry.resultStatus === 'failed' ? formatImportOutcome(entry, t) : entry.sourceName,
    fallbackType: entry.sourceKind,
    nodeId: entry.nodeId,
    nodesById
  });
}

export function InboxImportedNodeRow({
  entry,
  nodesById,
  onOpenNode
}: {
  entry: RuntimeTextImportResult;
  nodesById: Record<string, Node>;
  onOpenNode: (nodeId: string) => void;
}) {
  const t = useTranslation();
  if (!entry.nodeId || !nodesById[entry.nodeId]) {
    return null;
  }

  const presentation = buildRunPresentation(entry, nodesById, t);

  return (
    <ImportCatalogListItem
      actions={renderImportActions({
        canOpenNode: true,
        nodeId: entry.nodeId,
        onOpenNode,
        openTopicLabel: t('desktop.importOverview.openTopic'),
        status: entry.resultStatus,
        tone: resolveTone(entry)
      })}
      meta={renderImportMeta(presentation.meta)}
      summary={renderImportOpening(presentation.opening)}
      title={renderImportTitle(presentation.title)}
      trailing={renderImportDate(presentation.date, t('desktop.importOverview.dateImported'))}
    />
  );
}

export function InboxRecentRunRow({
  entry,
  nodesById,
  onOpenNode
}: {
  entry: RuntimeTextImportResult;
  nodesById: Record<string, Node>;
  onOpenNode: (nodeId: string) => void;
}) {
  const t = useTranslation();
  const canOpenNode = Boolean(entry.nodeId && nodesById[entry.nodeId]);
  const presentation = buildRunPresentation(entry, nodesById, t);

  return (
    <ImportCatalogListItem
      actions={renderImportActions({
        canOpenNode,
        nodeId: entry.nodeId,
        onOpenNode,
        openTopicLabel: t('desktop.importOverview.openTopic'),
        status: entry.resultStatus,
        tone: resolveTone(entry)
      })}
      meta={renderImportMeta(presentation.meta)}
      summary={renderImportOpening(presentation.opening)}
      title={renderImportTitle(presentation.title)}
      trailing={renderImportDate(presentation.date, t('desktop.importOverview.dateImported'))}
    />
  );
}
