import fs from 'node:fs';
import path from 'node:path';

import { resolveImportedNodeTitle } from '../../lib/core/import/importedNodeTitle.js';
import { extractNodeOpeningPreview } from '../../lib/core/nodes/nodeOpeningPreview.js';
import type { NativeUnsyncedSourcesResult } from '../../lib/platform/nativeUnsyncedSourcesContract.js';
import { listRemovedKeepImportItems } from '../database/keepImportItems.js';
import { loadImportManagerSettings } from '../import/importManagerSettings.js';

function resolveRuleDirectory(ruleId: string) {
  const settings = loadImportManagerSettings();
  const source = [...settings.readwiseSources, ...settings.sources].find((entry) => entry.id === ruleId);
  return source?.primaryPath.trim() ?? '';
}

function loadSourcePreview(ruleId: string, sourcePath: string) {
  const directoryPath = resolveRuleDirectory(ruleId);
  const filePath = path.isAbsolute(sourcePath) ? sourcePath : path.join(directoryPath, sourcePath);
  const fallbackTitle = path.basename(sourcePath).replace(/\.(md|markdown|html|txt)$/i, '').trim() || path.basename(sourcePath);
  if (!directoryPath && !path.isAbsolute(sourcePath)) {
    return { contentPreview: null, title: fallbackTitle };
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const title = resolveImportedNodeTitle({ content, sourceName: sourcePath, titleStrategy: 'heading' });
    const preview = extractNodeOpeningPreview(content, title);
    return { contentPreview: preview === 'No opening yet.' ? null : preview, title };
  } catch {
    return { contentPreview: null, title: fallbackTitle };
  }
}

export function loadUnsyncedSources(): NativeUnsyncedSourcesResult {
  return {
    entries: listRemovedKeepImportItems().map((entry) => {
      const preview = loadSourcePreview(entry.rule_id, entry.source_path);
      return {
        content_preview: preview.contentPreview,
        first_seen_at: entry.first_seen_at,
        has_source_update: entry.has_source_update === 1,
        last_imported_at: entry.last_imported_at,
        last_node_id: entry.last_node_id,
        last_seen_at: entry.last_seen_at,
        rule_id: entry.rule_id,
        source_path: entry.source_path,
        source_state: 'present',
        title: preview.title
      };
    }),
    loaded_at: new Date().toISOString()
  };
}
