import fs from 'node:fs/promises';
import path from 'node:path';

import {
  loadDesktopSourceByConfig,
  resolveDesktopSourceAddress,
  upsertDesktopSource
} from '../database/desktopSources.js';
import { resolveImportKind, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import type { KeepImportRuleConfig } from './keepImportService.js';

export function resolveKeepImportRuleConfig(ruleId: string): KeepImportRuleConfig | null {
  const settings = loadImportManagerSettings();
  const readwiseRule = settings.readwiseSources.find((entry) => entry.id === ruleId);
  if (readwiseRule?.primaryPath.trim()) {
    return {
      actionMode: readwiseRule.actionMode,
      directoryPath: readwiseRule.primaryPath.trim(),
      highlightDirectoryPath: readwiseRule.highlightPath.trim(),
      highlightMode: readwiseRule.highlightMode,
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
    actionMode: genericRule.actionMode,
    directoryPath: genericRule.primaryPath.trim(),
    highlightDirectoryPath: genericRule.highlightPath.trim(),
    highlightMode: genericRule.highlightMode,
    highlightPolicy: genericRule.highlightMode === 'merged' ? 'adopt' : 'reference_only',
    ruleId,
    sourceType: 'generic'
  };
}

export async function buildKeepImportSourceDescriptor(
  config: KeepImportRuleConfig,
  sourcePath: string
): Promise<DirectoryImportSourceDescriptor> {
  const sourceType = config.sourceType === 'readwise' ? 'readwise' : 'watched';
  const persisted = loadDesktopSourceByConfig(sourceType, config.ruleId) ?? upsertDesktopSource({
    configRef: config.ruleId,
    rootPath: config.directoryPath,
    sourceType,
    typeSettings: { highlightDirectoryPath: config.highlightDirectoryPath ?? '' },
    updatedAt: new Date().toISOString()
  });
  const location = path.isAbsolute(sourcePath) ? path.relative(config.directoryPath, sourcePath) : sourcePath;
  const filePath = resolveDesktopSourceAddress(persisted.source_ref, location);
  if (!filePath) throw new Error('source_location_unavailable');
  const stats = await fs.stat(filePath);
  const kind = resolveImportKind(filePath);
  return {
    adapterId: kind === 'html' ? 'html_directory' : kind === 'text' ? 'text_directory' : 'markdown_directory',
    filePath,
    kind,
    mtimeMs: stats.mtimeMs,
    sizeBytes: stats.size,
    sourceName: location.replaceAll('\\', '/')
  };
}
