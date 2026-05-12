import fs from 'node:fs';
import path from 'node:path';

import { resolveImportedNodeTitle } from '../../lib/core/import/importedNodeTitle.js';
import type { NativeRemovedSourcesResult } from '../../lib/platform/nativeRemovedSourcesContract.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';
import { rewriteExternalPreviewContent } from '../database/externalSearchPreviewContent.js';
import { listRemovedKeepImportItems } from '../database/keepImportItems.js';
import { loadImportManagerSettings } from '../import/importManagerSettings.js';

function resolveRuleDirectory(ruleId: string) {
  const settings = loadImportManagerSettings();
  const source = [...settings.readwiseSources, ...settings.sources].find((entry) => entry.id === ruleId);
  return source?.primaryPath.trim() ?? '';
}

function loadSourceDocument(ruleId: string, sourcePath: string) {
  const directoryPath = resolveRuleDirectory(ruleId);
  const filePath = path.isAbsolute(sourcePath) ? sourcePath : path.join(directoryPath, sourcePath);
  const fallbackTitle = path.basename(sourcePath).replace(/\.(md|markdown|html|txt)$/i, '').trim() || path.basename(sourcePath);
  if (!directoryPath && !path.isAbsolute(sourcePath)) {
    return { content: null, contentPreview: null, title: fallbackTitle };
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const title = resolveImportedNodeTitle({ content, sourceName: sourcePath, titleStrategy: 'heading' });
    const previewContent = rewriteExternalPreviewContent(content, filePath, createRemovedPreviewFolder(directoryPath));
    return { content: previewContent, contentPreview: previewContent, title };
  } catch {
    return { content: null, contentPreview: null, title: fallbackTitle };
  }
}

function createRemovedPreviewFolder(directoryPath: string): NativeExternalSearchFolder {
  return {
    attachment_mode: 'document_relative_first_then_fixed_root',
    attachment_root_path: null,
    created_at: '',
    document_count: 0,
    excluded_dirs: [],
    folder_path: directoryPath,
    id: 'removed-preview',
    indexed_at: null,
    last_error: null,
    status: 'ready',
    updated_at: ''
  };
}

export function loadRemovedSources(): NativeRemovedSourcesResult {
  return {
    entries: listRemovedKeepImportItems().map((entry) => {
      const source = loadSourceDocument(entry.rule_id, entry.source_path);
      return {
        content: source.content,
        content_preview: source.contentPreview,
        first_seen_at: entry.first_seen_at,
        has_source_update: entry.has_source_update === 1,
        last_imported_at: entry.last_imported_at,
        last_node_id: entry.last_node_id,
        last_seen_at: entry.last_seen_at,
        rule_id: entry.rule_id,
        source_path: entry.source_path,
        source_state: 'present',
        title: source.title
      };
    }),
    loaded_at: new Date().toISOString()
  };
}
