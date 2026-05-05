import { type AnchorRange, buildAnchorDisplayPlan, collectAnchorCoverageSegments, collectAnchorTagTokens, collectAnchorTokenRanges } from './anchorRecords.js';

export interface AnchorDecorationRange {
  className: string;
  from: number;
  to: number;
}

export interface AnchorDecorationPlan {
  markRanges: AnchorDecorationRange[];
  replaceRanges: AnchorRange[];
}

export function collectAnchorSensitiveRanges(content: string): AnchorRange[] {
  const tagRanges = collectAnchorTokenRanges(content);
  const contentRanges = collectAnchorCoverageSegments(content)
    .filter((segment) => segment.activeHighlightCount > 0 || segment.activeClozeCount > 0)
    .map((segment) => ({ from: segment.from, to: segment.to }));
  return tagRanges.concat(contentRanges);
}

export function buildPreviewAnchorDecorationPlan(
  content: string,
  hiddenAnchorKeys: ReadonlySet<string> = new Set()
): AnchorDecorationPlan {
  const plan = buildAnchorDisplayPlan(content, hiddenAnchorKeys);
  return {
    markRanges: [
      ...plan.highlightRanges.map((range) => ({ ...range, className: 'cm-md-highlight' })),
      ...plan.clozeRanges.map((range) => ({ ...range, className: 'cm-md-cloze' })),
      ...plan.highlightOverlapRanges.map((range) => ({ ...range, className: 'cm-md-highlight-overlap' })),
      ...plan.mixedOverlapRanges.map((range) => ({ ...range, className: 'cm-md-anchor-overlap' }))
    ],
    replaceRanges: plan.tokenRanges
  };
}

export function buildSourceModeAnchorDecorationPlan(content: string): AnchorDecorationPlan {
  const markRanges: AnchorDecorationRange[] = [];

  for (const token of collectAnchorTagTokens(content)) {
    const raw = content.slice(token.from, token.to);
    const slashLength = token.slash ? 1 : 0;
    const kindFrom = token.from + 1 + slashLength;
    const kindTo = kindFrom + token.kind.length;
    const idPrefix = 'id="';
    const idPrefixOffset = raw.indexOf(idPrefix);

    markRanges.push({ className: 'cm-md-anchor-tag-token', from: token.from, to: token.to });
    markRanges.push({ className: 'cm-md-anchor-tag-delimiter', from: token.from, to: token.from + 1 });
    markRanges.push({ className: 'cm-md-anchor-tag-delimiter', from: token.to - 1, to: token.to });
    if (token.slash) {
      markRanges.push({ className: 'cm-md-anchor-tag-delimiter', from: token.from + 1, to: token.from + 2 });
    }
    markRanges.push({ className: 'cm-md-anchor-tag-kind', from: kindFrom, to: kindTo });

    if (idPrefixOffset < 0) {
      continue;
    }

    const attrFrom = token.from + idPrefixOffset;
    const idFrom = attrFrom + idPrefix.length;
    const idTo = idFrom + token.id.length;
    markRanges.push({ className: 'cm-md-anchor-tag-attr', from: attrFrom, to: idFrom });
    markRanges.push({ className: 'cm-md-anchor-tag-id', from: idFrom, to: idTo });
    markRanges.push({ className: 'cm-md-anchor-tag-attr', from: idTo, to: Math.min(idTo + 1, token.to) });
  }

  return {
    markRanges,
    replaceRanges: []
  };
}
