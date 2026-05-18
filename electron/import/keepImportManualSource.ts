import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveImportKind, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import type { KeepImportRuleConfig } from './keepImportService.js';

export function resolveKeepImportRuleConfig(ruleId: string): KeepImportRuleConfig | null {
  const settings = loadImportManagerSettings();
  const readwiseRule = settings.readwiseSources.find((entry) => entry.id === ruleId);
  if (readwiseRule?.primaryPath.trim()) {
    return {
      directoryPath: readwiseRule.primaryPath.trim(),
      highlightPolicy: 'reference_only',
      ruleId,
      sourceType: 'readwise'
    };
  }
  const genericRule = settings.sources.find((entry) => entry.id === ruleId);
  if (!genericRule?.primaryPath.trim()) {
    return null;
  }
  return {
    directoryPath: genericRule.primaryPath.trim(),
    highlightPolicy: genericRule.highlightMode === 'merged' ? 'adopt' : 'reference_only',
    ruleId,
    sourceType: 'generic'
  };
}

export async function buildKeepImportSourceDescriptor(
  config: KeepImportRuleConfig,
  sourcePath: string
): Promise<DirectoryImportSourceDescriptor> {
  const filePath = path.isAbsolute(sourcePath) ? sourcePath : path.join(config.directoryPath, sourcePath);
  const stats = await fs.stat(filePath);
  const kind = resolveImportKind(filePath);
  return {
    adapterId: kind === 'html' ? 'html_directory' : kind === 'text' ? 'text_directory' : 'markdown_directory',
    filePath,
    kind,
    mtimeMs: stats.mtimeMs,
    sizeBytes: stats.size,
    sourceName: path.isAbsolute(sourcePath) ? path.basename(sourcePath) : sourcePath
  };
}
