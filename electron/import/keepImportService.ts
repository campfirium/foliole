import type { ImportHighlightPolicy } from '../../lib/core/import/contract.js';
import type { NativeKeepImportPreviewResult } from '../../lib/platform/nativeImportContract.js';
import { discoverDirectoryImportSources, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { logReadwiseScanFailed, logReadwiseScanStarted } from './importRunLogger.js';
import { shouldKeepImportReadwiseSource } from './keepImportPreparedRecord.js';
import { buildKeepImportPreviewResult } from './keepImportPreviewResult.js';
import { logReadwiseRunCompleted, shouldLogReadwiseScan, type KeepImportRunEntry } from './keepImportReadwiseLogging.js';
import { runSingleKeepImportSource } from './keepImportRunSource.js';
import { classifySource } from './keepImportSourceClassifier.js';

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
  if (shouldLogReadwiseScan(config.sourceType)) {
    await logReadwiseScanStarted({ directoryPath: config.directoryPath, ruleId: config.ruleId });
  }
  try {
    const discoveredSources = await discoverDirectoryImportSources(config.directoryPath);
    const importableSources = (
      await Promise.all(
        discoveredSources.map(async (source) => ((await shouldKeepImportReadwiseSource(config, source)) ? source : null))
      )
    ).filter((source): source is DirectoryImportSourceDescriptor => source !== null);
    const runEntries: KeepImportRunEntry[] = [];
    for (const source of importableSources) {
      runEntries.push(await runSingleKeepImportSource(config, source));
    }
    if (shouldLogReadwiseScan(config.sourceType)) {
      await logReadwiseRunCompleted({
        directoryPath: config.directoryPath,
        entries: runEntries,
        ruleId: config.ruleId
      });
    }
  } catch (error) {
    if (shouldLogReadwiseScan(config.sourceType)) {
      await logReadwiseScanFailed({
        directoryPath: config.directoryPath,
        error,
        ruleId: config.ruleId
      });
    }
    throw error;
  }
}
