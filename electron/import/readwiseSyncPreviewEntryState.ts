import type { NativeReadwiseSyncPreviewEntry } from '../../lib/platform/nativeImportContract.js';

import type { resolveReadwiseSourceImportDecision } from './readwisePreparedImport.js';

export function resolveReadwisePreviewHighlightStatus(input: {
  decision: Awaited<ReturnType<typeof resolveReadwiseSourceImportDecision>>;
  hasPrimaryFile: boolean;
}): NonNullable<NativeReadwiseSyncPreviewEntry['highlight_status']> {
  if (!input.decision.hasHighlightFile) return 'without_highlights';
  if (input.decision.detectedHighlightCount === 0) return 'unparsed';
  return input.hasPrimaryFile ? 'with_highlights' : 'highlight_only';
}

export function sortReadwisePreviewEntries(entries: NativeReadwiseSyncPreviewEntry[]) {
  return [...entries].sort((left, right) => {
    if (left.highlight_status === 'unparsed' && right.highlight_status !== 'unparsed') return -1;
    if (right.highlight_status === 'unparsed' && left.highlight_status !== 'unparsed') return 1;
    if (left.highlight_status === 'highlight_only' && right.highlight_status !== 'highlight_only') return -1;
    if (right.highlight_status === 'highlight_only' && left.highlight_status !== 'highlight_only') return 1;
    return 0;
  });
}
