import type { ImportHighlightPolicy } from '../../lib/core/import/contract.js';
import type { NativeKeepImportPreviewResult } from '../../lib/platform/nativeImportContract.js';
import { discoverDirectoryImportSources, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { reconcileKeepImportCatalog } from './keepImportCatalogReconcile.js';
import { shouldKeepImportReadwiseSource } from './keepImportPreparedRecord.js';
import { buildKeepImportPreviewResult } from './keepImportPreviewResult.js';
import { logReadwiseRunCompleted, shouldLogReadwiseScan, type KeepImportRunEntry } from './keepImportReadwiseLogging.js';
import { runSingleKeepImportSource } from './keepImportRunSource.js';
import { classifySource } from './keepImportSourceClassifier.js';
import {
  logReadwiseScanFailed,
  logReadwiseScanStarted,
  logReadwiseSourceCompleted,
  logReadwiseSourceStarted
} from './readwiseImportRunLogger.js';

export interface KeepImportRuleConfig {
  directoryPath: string;
  highlightPolicy: ImportHighlightPolicy;
  ruleId: string;
  sourceType?: 'generic' | 'readwise';
}

export async function previewKeepImportRule(config: KeepImportRuleConfig): Promise<NativeKeepImportPreviewResult> {
  const previewedAt = new Date().toISOString();
  const discoveredSources = await discoverDirectoryImportSources(config.directoryPath);
  const importableSources = (
    await Promise.all(
      discoveredSources.map(async (source) => ((await shouldKeepImportReadwiseSource(config, source)) ? source : null))
    )
  ).filter((source): source is DirectoryImportSourceDescriptor => source !== null);
  const entries = await Promise.all(importableSources.map((source) => classifySource(config, source)));
  return buildKeepImportPreviewResult(config.directoryPath, previewedAt, entries);
}

export async function runKeepImportRule(config: KeepImportRuleConfig) {
  const logReadwiseProgress = shouldLogReadwiseScan(config.sourceType);
  if (logReadwiseProgress) {
    await logReadwiseScanStarted({ directoryPath: config.directoryPath, ruleId: config.ruleId });
  }
  try {
    const discoveredSources = await discoverDirectoryImportSources(config.directoryPath);
    const importableSources = (
      await Promise.all(
        discoveredSources.map(async (source) => ((await shouldKeepImportReadwiseSource(config, source)) ? source : null))
      )
    ).filter((source): source is DirectoryImportSourceDescriptor => source !== null);
    await reconcileKeepImportCatalog(config, importableSources);
    const runEntries: KeepImportRunEntry[] = [];
    for (const source of importableSources) {
      const startedAt = Date.now();
      if (logReadwiseProgress) {
        await logReadwiseSourceStarted({ directoryPath: config.directoryPath, ruleId: config.ruleId, sourcePath: source.sourceName });
      }
      runEntries.push(
        await runSingleKeepImportSource(config, source, {
          notifyUpdate: config.sourceType !== 'readwise'
        })
      );
      if (logReadwiseProgress) {
        await logReadwiseSourceCompleted({
          directoryPath: config.directoryPath,
          durationMs: Date.now() - startedAt,
          ruleId: config.ruleId,
          sourcePath: source.sourceName
        });
      }
    }
    if (logReadwiseProgress) {
      await logReadwiseRunCompleted({
        directoryPath: config.directoryPath,
        entries: runEntries,
        ruleId: config.ruleId
      });
    }
    return runEntries;
  } catch (error) {
    if (logReadwiseProgress) {
      await logReadwiseScanFailed({
        directoryPath: config.directoryPath,
        error,
        ruleId: config.ruleId
      });
    }
    throw error;
  }
}
