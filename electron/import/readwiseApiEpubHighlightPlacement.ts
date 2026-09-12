import { applyImportedHighlightAnchors } from '../../lib/core/database/importHighlightAnchors.js';
import type { PreparedImportHighlightRecord } from '../../lib/core/import/contract.js';
import { collectBoundaryFragments } from '../../lib/core/import/controlledContextText.js';

interface EpubBody {
  content: string;
  id: string;
}

function findFirstStructuralBody(bodies: EpubBody[], highlight: PreparedImportHighlightRecord) {
  const direct = bodies.find((body) => (
    applyImportedHighlightAnchors({
      ambiguityPolicy: 'first', content: body.content, highlights: [highlight]
    }).highlights.length === 1
  ));
  if (direct) return {
    body: direct,
    locatorText: highlight.locatorText ?? highlight.content
  };
  if (!highlight.locatorText) return null;

  const fragments = collectBoundaryFragments(highlight.locatorText)
    .filter((fragment) => fragment.length >= 12)
    .sort((left, right) => right.length - left.length);
  for (const fragment of fragments) {
    const body = bodies.find((candidate) => candidate.content.includes(fragment));
    if (body) return { body, locatorText: fragment };
  }
  return null;
}

export function placeReadwiseApiEpubHighlight(input: {
  bodies: EpubBody[];
  highlight: PreparedImportHighlightRecord;
  rootNodeId: string;
}) {
  const match = findFirstStructuralBody(input.bodies, input.highlight);
  return match ? {
    highlight: { ...input.highlight, locatorText: match.locatorText },
    parentId: match.body.id
  } : {
    highlight: { ...input.highlight, locatorText: null },
    parentId: input.rootNodeId
  };
}
