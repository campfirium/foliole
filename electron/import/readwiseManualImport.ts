import type { NativeReadwiseManualImportResult } from '../../lib/platform/nativeReadwiseManualImportContract.js';
import { resolveImportedNodeIdForExternalDocument } from '../database/externalDocumentImportVisibility.js';
import { readKeepImportItem } from '../database/keepImportItems.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';
import { hideReadwiseExternalDocument } from '../database/readwiseManagedExternalDocuments.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { assertKeepImportSourceCanRun } from './keepImportExecutionGuard.js';
import { buildKeepImportSourceDescriptor, resolveKeepImportRuleConfig } from './keepImportManualSource.js';
import { runSingleKeepImportSource } from './keepImportRunSource.js';
import { commitReadwiseApiDocument } from './readwiseApiDocumentCommit.js';
import type { ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { adoptReadwiseInventoryBook } from './readwiseBookPolicyProjection.js';
import { loadReadwiseBooksInventoryForPaths } from './readwiseBooksInventoryLoad.js';
import { fetchReadwiseManualDocument } from './readwiseManualApiDocument.js';
import { presentReadwiseManualSource, readwiseSearchContext, requireReadwiseManualSource } from './readwiseManualSearch.js';
import type { ReadwiseSearchMetadata } from './readwiseManualSearchMetadata.js';
import { restoreRemovedSource } from './removedSourceRestore.js';

const pending = new Map<string, Promise<NativeReadwiseManualImportResult>>();

export function importReadwiseManualSource(id: string, reimport: boolean, dependencies: ReadwiseApiFetchDependencies = {}) {
  const selected = requireReadwiseManualSource(id);
  const key = `${selected.context.key}:${id}`;
  const running = pending.get(key);
  if (running) return running;
  const promise = importSelected(selected, reimport, dependencies).finally(() => { pending.delete(key); });
  pending.set(key, promise);
  return promise;
}

async function importSelected(
  selected: ReturnType<typeof requireReadwiseManualSource>,
  reimport: boolean,
  dependencies: ReadwiseApiFetchDependencies
): Promise<NativeReadwiseManualImportResult> {
  const { source, context } = selected;
  const status = presentReadwiseManualSource(source).status;
  if (status === 'suppressed') return { status: 'suppressed', node_id: null };
  if (status === 'deleted' && !reimport) return { status: 'reimport_required', node_id: null };
  if (status === 'imported') return { status: 'imported', node_id: importedNodeId(source, context.connectionRef) };
  const assertEligible = () => {
    if (readwiseSearchContext().key !== context.key) throw new Error('readwise_execution_eligibility_lost');
    if (presentReadwiseManualSource(source).status === 'suppressed') throw new Error('readwise_source_suppressed');
  };
  if (source.remoteId && context.connectionRef) {
    const document = await fetchReadwiseManualDocument(source.remoteId, dependencies);
    assertEligible();
    const result = await commitReadwiseApiDocument({
      assertEligible, config: loadImportManagerSettings().readwiseReaderConfig,
      connectionRef: context.connectionRef, dependencies, destination: 'inbox', document,
      reimportDeleted: reimport
    });
    if (result.status === 'skipped') return { status: 'suppressed', node_id: null };
    const nodeId = importedNodeId(source, context.connectionRef);
    if (!nodeId || result.status === 'blocked') throw new Error('readwise_manual_import_failed');
    return { status: 'imported', node_id: nodeId };
  }
  return importFolderSource(source, reimport, assertEligible);
}

async function importFolderSource(source: ReadwiseSearchMetadata, reimport: boolean, assertEligible: () => void) {
  const config = resolveKeepImportRuleConfig(source.ruleId!);
  if (!config) throw new Error('readwise_search_source_unavailable');
  assertEligible();
  assertKeepImportSourceCanRun(config);
  if (source.bookKey) {
    const settings = loadImportManagerSettings();
    const rule = settings.readwiseSources.find((item) => item.id === source.ruleId)!;
    const { inventory } = await loadReadwiseBooksInventoryForPaths({
      fullDocumentDirectoryPath: rule.primaryPath, highlightDirectoryPath: rule.highlightPath,
      readwiseConfig: settings.readwiseReaderConfig
    });
    assertEligible();
    if (rule.kind !== 'books') throw new Error('readwise_search_source_unavailable');
    await adoptReadwiseInventoryBook({ ...rule, kind: rule.kind }, inventory, source.bookKey, reimport);
  } else if (reimport && presentReadwiseManualSource(source).status === 'deleted') {
    const result = await restoreRemovedSource(source.ruleId!, source.sourcePath!, { forceTopicImport: true });
    if (result.status !== 'restored' || !result.node_id) throw new Error('readwise_manual_import_failed');
  } else {
    const descriptor = await buildKeepImportSourceDescriptor(config, source.sourcePath!);
    assertEligible();
    const result = await runSingleKeepImportSource(config, descriptor, { forceTopicImport: true });
    if (!result.importStatus || result.importStatus === 'failed') throw new Error('readwise_manual_import_failed');
  }
  const nodeId = importedNodeId(source, null);
  if (!nodeId) throw new Error('readwise_manual_import_failed');
  const kind = loadImportManagerSettings().readwiseSources.find((item) => item.id === source.ruleId)?.kind;
  if (kind) hideReadwiseExternalDocument(kind, source.sourcePath!, new Date().toISOString());
  return { status: 'imported' as const, node_id: nodeId };
}

function importedNodeId(source: ReadwiseSearchMetadata, connectionRef: string | null) {
  return source.remoteId && connectionRef
    ? loadReadwiseApiImportSource(connectionRef, source.remoteId)?.nodeId ?? null
    : readKeepImportItem(source.ruleId!, source.sourcePath!)?.last_node_id ?? (source.filePath ? resolveImportedNodeIdForExternalDocument(source.filePath) : null) ?? source.nodeId ?? null;
}
