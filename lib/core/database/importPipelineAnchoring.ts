import type { PreparedImportRecord } from '../import/contract.js';

import { applyImportedHighlightAnchors } from './importHighlightAnchors.js';
import { resolveReadwiseHighlightUpdate } from './importReadwiseHighlightUpdates.js';

export function resolveAnchoredImport(
  prepared: PreparedImportRecord,
  options: { ambiguityPolicy?: 'first' | 'unique'; resetImportedStructure?: boolean }
) {
  if (prepared.sourceProfile === 'body_with_highlight_sidecar' && !options.resetImportedStructure) {
    return resolveReadwiseHighlightUpdate({
      existingChildContents: [], existingContent: prepared.content, prepared
    });
  }
  return applyImportedHighlightAnchors({
    ...(options.ambiguityPolicy ? { ambiguityPolicy: options.ambiguityPolicy } : {}),
    content: prepared.content,
    highlights: prepared.matchedHighlights
  });
}
