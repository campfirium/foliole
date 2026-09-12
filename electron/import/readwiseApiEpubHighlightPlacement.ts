import { applyImportedHighlightAnchors } from '../../lib/core/database/importHighlightAnchors.js';
import type { PreparedImportHighlightRecord } from '../../lib/core/import/contract.js';
import { collectBoundaryFragments } from '../../lib/core/import/controlledContextText.js';

interface EpubBody {
  content: string;
  id: string;
}

function uniqueFragmentMatch(body: EpubBody, fragment: string) {
  const first = body.content.indexOf(fragment);
  return first >= 0 && body.content.indexOf(fragment, first + 1) < 0;
}

function findUniqueStructuralBody(bodies: EpubBody[], highlight: PreparedImportHighlightRecord) {
  const direct = bodies.filter((body) => (
    applyImportedHighlightAnchors({ content: body.content, highlights: [highlight] }).highlights.length === 1
  ));
  if (direct.length === 1) return {
    body: direct[0]!,
    locatorText: highlight.locatorText ?? highlight.content
  };
  if (!highlight.locatorText) return null;

  const fragments = collectBoundaryFragments(highlight.locatorText)
    .filter((fragment) => fragment.length >= 12)
    .sort((left, right) => right.length - left.length);
  for (const fragment of fragments) {
    const matches = bodies.filter((body) => uniqueFragmentMatch(body, fragment));
    if (matches.length === 1) return { body: matches[0]!, locatorText: fragment };
  }
  return null;
}

export function placeReadwiseApiEpubHighlight(input: {
  bodies: EpubBody[];
  highlight: PreparedImportHighlightRecord;
  rootNodeId: string;
}) {
  const match = findUniqueStructuralBody(input.bodies, input.highlight);
  return match ? {
    highlight: { ...input.highlight, locatorText: match.locatorText },
    parentId: match.body.id
  } : {
    highlight: { ...input.highlight, locatorText: null },
    parentId: input.rootNodeId
  };
}
