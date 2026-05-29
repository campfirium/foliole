import type { ImportHighlightPolicy } from '../../lib/core/import/contract.js';
import type { ImportSourceAction } from '../../lib/core/import/importSourceActions.js';
import type { NativeKeepImportPreviewResult } from '../../lib/platform/nativeKeepImportContract.js';
import { discoverDirectoryImportSources, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { reconcileKeepImportCatalog } from './keepImportCatalogReconcile.js';
import { shouldKeepImportReadwiseSource } from './keepImportPreparedRecord.js';
import { buildKeepImportPreviewResult } from './keepImportPreviewResult.js';
import type { KeepImportProgressSink } from './keepImportProgress.js';
import { throwIfKeepImportAborted, yieldKeepImportRunner } from './keepImportProgress.js';
import type { KeepImportRunEntry } from './keepImportReadwiseLogging.js';
import { requestKeepImportRun } from './keepImportRunnerOwner.js';
import { runSingleKeepImportSource } from './keepImportRunSource.js';
import { classifySource } from './keepImportSourceClassifier.js';
import { discoverReadwiseImportSources } from './readwiseSourceDiscovery.js';

export interface KeepImportRuleConfig {
  actionMode?: ImportSourceAction;
  directoryPath: string;
  highlightDirectoryPath?: string;
  highlightMode?: 'merged' | 'split';
  highlightPolicy: ImportHighlightPolicy;
  onProgress?: KeepImportProgressSink;
  ruleId: string;
  signal?: AbortSignal;
  sourceType?: 'generic' | 'readwise';
}

export async function previewKeepImportRule(config: KeepImportRuleConfig): Promise<NativeKeepImportPreviewResult> {
  const previewedAt = new Date().toISOString();
  const discoveredSources = await discoverKeepImportSources(config);
  const importableSources = (
    await Promise.all(
      discoveredSources.map(async (source) => ((await shouldKeepImportReadwiseSource(config, source)) ? source : null))
    )
  ).filter((source): source is DirectoryImportSourceDescriptor => source !== null);
  const entries = await Promise.all(importableSources.map((source) => classifySource(config, source)));
  return buildKeepImportPreviewResult(config.directoryPath, previewedAt, entries);
}

export async function requestKeepImportRuleRun(config: KeepImportRuleConfig) {
  return requestKeepImportRun(config, () => runKeepImportRuleNow(config));
}

export async function runKeepImportRule(config: KeepImportRuleConfig) {
  return requestKeepImportRuleRun(config);
}

async function runKeepImportRuleNow(config: KeepImportRuleConfig) {
  throwIfKeepImportAborted(config.signal);
  const discoveredSources = await discoverKeepImportSources(config);
  throwIfKeepImportAborted(config.signal);
  const sourcePlan = await Promise.all(
    discoveredSources.map(async (source) => ({
      shouldImport: await shouldKeepImportReadwiseSource(config, source),
      source
    }))
  );
  throwIfKeepImportAborted(config.signal);
  await reconcileKeepImportCatalog(config, discoveredSources);
  const runEntries: KeepImportRunEntry[] = [];
  for (const [index, planned] of sourcePlan.entries()) {
    runEntries.push(await runPlannedKeepImportSource(config, planned, index, sourcePlan.length));
  }
  return runEntries;
}

async function discoverKeepImportSources(config: KeepImportRuleConfig) {
  if (config.sourceType !== 'readwise') {
    return discoverDirectoryImportSources(config.directoryPath);
  }
  const readwiseSource = loadImportManagerSettings().readwiseSources.find((entry) => entry.id === config.ruleId);
  if (!readwiseSource?.highlightPath.trim() || readwiseSource.kind === 'books') {
    return discoverDirectoryImportSources(config.directoryPath);
  }
  return discoverReadwiseImportSources({
    highlightDirectoryPath: readwiseSource.highlightPath.trim(),
    primaryDirectoryPath: config.directoryPath
  });
}

async function runPlannedKeepImportSource(
  config: KeepImportRuleConfig,
  planned: { shouldImport: boolean; source: DirectoryImportSourceDescriptor },
  index: number,
  sourceTotalCount: number
) {
  const { source } = planned;
  await yieldKeepImportRunner(config.signal);
  config.onProgress?.({
    currentSourcePath: source.sourceName,
    phase: 'scanning',
    sourceProcessedCount: index,
    sourceTotalCount
  });
  const entry = planned.shouldImport
    ? await runSingleKeepImportSource(config, source, {
      notifyUpdate: config.sourceType !== 'readwise',
      onProgress: (event) => {
        config.onProgress?.({ ...event, sourceProcessedCount: index, sourceTotalCount });
      }
    })
    : {
      action: 'skipped' as const,
      detail: 'Skipped by current Readwise import behavior.',
      failureReason: null,
      importStatus: null,
      previewStatus: 'unchanged' as const,
      sourcePath: source.sourceName
    };
  config.onProgress?.({
    currentSourcePath: source.sourceName,
    phase: 'source_completed',
    sourceProcessedCount: index + 1,
    sourceTotalCount
  });
  await yieldKeepImportRunner(config.signal);
  return entry;
}
