import type { PreparedImportHighlightRecord } from '../import/contract.js';
import { createImportedClozePrompt, toImportedAnchorLink } from '../import/importGeneratedHighlightText.js';
import { assertNodeAnchorTextWithinBudget, assertNodeTextWithinBudget, NodeTextTooLargeError } from '../nodes/nodeTextBudget.js';

import { parseStoredAnchorLink } from './anchorLinkCodec.js';
import type { AnchoredImportedHighlightRecord } from './importHighlightAnchors.js';

type ImportHighlight = PreparedImportHighlightRecord | AnchoredImportedHighlightRecord;

function validate(highlight: ImportHighlight, parentContent: string) {
  const cloze = 'kind' in highlight && highlight.kind === 'cloze';
  const content = cloze ? createImportedClozePrompt(parentContent, highlight) : highlight.content;
  assertNodeTextWithinBudget(content, 'content');
  assertNodeTextWithinBudget(highlight.content, cloze ? 'reveal' : 'content');
  assertNodeTextWithinBudget(highlight.label, 'label');
  assertNodeAnchorTextWithinBudget(parseStoredAnchorLink(toImportedAnchorLink(highlight)));
}

/** Reject each derived item before any node/locator mutation, preserving the source body. */
export function filterImportHighlightsWithinBudget<T extends ImportHighlight>(highlights: readonly T[],
  parentContent: string, failures?: string[]) {
  const accepted: T[] = [];
  const rejected: T[] = [];
  for (const [index, highlight] of highlights.entries()) {
    try { validate(highlight, parentContent); accepted.push(highlight); }
    catch (error) {
      if (!(error instanceof NodeTextTooLargeError) || !failures) throw error;
      const cloze = 'kind' in highlight && highlight.kind === 'cloze';
      const fieldLabel = error.field === 'title' ? 'title' : error.field === 'reveal' ? 'answer'
        : error.field === 'content' && cloze ? 'prompt' : 'reference text';
      failures.push(`Imported ${cloze ? 'cloze' : 'highlight'} ${highlight.nodeId ?? index + 1} exceeds the 1 MiB text limit (${fieldLabel}, ${error.actualBytes} UTF-8 bytes) and was not imported.`);
      rejected.push(highlight);
    }
  }
  return { highlights: accepted, rejected };
}
