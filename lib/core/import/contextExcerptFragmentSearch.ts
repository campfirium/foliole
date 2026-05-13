interface MatchBudget {
  stopped: boolean;
}

export interface RepeatedFragmentCandidate {
  fragment: string;
  indexes: number[];
}

export interface AnchoredFragmentCandidate {
  fragment: string;
  index: number;
}

export function collectOrderedBoundaryFragments(quote: string) {
  const unique = new Set<string>();
  const ordered: string[] = [];
  const splitter = /[\s。！？!?；;：:，,、•✔❌]+/u;
  for (const part of quote.split(splitter)) {
    const fragment = part.trim().toLocaleLowerCase();
    if (fragment.length < 4 || unique.has(fragment)) {
      continue;
    }
    unique.add(fragment);
    ordered.push(fragment);
  }
  return ordered;
}

export function findNearestParagraphIndex(
  indexes: number[],
  anchorIndex: number,
  direction: 'backward' | 'forward'
) {
  if (indexes.length === 0) {
    return null;
  }
  const eligible = indexes.filter((index) => (direction === 'backward' ? index <= anchorIndex : index >= anchorIndex));
  const pool = eligible.length > 0 ? eligible : indexes;
  return pool.reduce((best, current) => {
    if (best === null) {
      return current;
    }
    const bestDistance = Math.abs(best - anchorIndex);
    const currentDistance = Math.abs(current - anchorIndex);
    if (currentDistance !== bestDistance) {
      return currentDistance < bestDistance ? current : best;
    }
    if (direction === 'backward') {
      return current > best ? current : best;
    }
    return current < best ? current : best;
  }, null as number | null);
}

export function collectOrderedMatchCandidates<TBudget extends MatchBudget>(args: {
  budget: TBudget;
  consumeAttempt: (budget: TBudget) => boolean;
  findParagraphIndexesContainingFragment: (fragment: string) => number[];
  orderedFragments: string[];
}) {
  const repeatedCandidates: RepeatedFragmentCandidate[] = [];
  let anchoredCandidate: AnchoredFragmentCandidate | null = null;
  for (const fragment of args.orderedFragments) {
    if (!args.consumeAttempt(args.budget)) {
      break;
    }
    const indexes = args.findParagraphIndexesContainingFragment(fragment);
    const onlyIndex = indexes[0];
    if (indexes.length === 1 && onlyIndex !== undefined) {
      anchoredCandidate = { fragment, index: onlyIndex };
      break;
    }
    if (indexes.length > 1 && indexes.length <= 12) {
      repeatedCandidates.push({ fragment, indexes });
    }
  }
  return { anchoredCandidate, repeatedCandidates };
}

export function resolveBestNearbyRange<TBudget extends MatchBudget>(
  candidates: RepeatedFragmentCandidate[],
  budget: TBudget,
  consumeAttempt: (budget: TBudget) => boolean
) {
  let bestRange: { anchorFragment: string; end: number; start: number } | null = null;
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex];
    if (!left) {
      continue;
    }
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      if (!consumeAttempt(budget)) {
        return bestRange;
      }
      const right = candidates[rightIndex];
      if (!right) {
        continue;
      }
      const matches = findNearbyMatches(left.indexes, right.indexes);
      const match = matches[0];
      if (matches.length !== 1 || !match) {
        continue;
      }
      const candidate = { anchorFragment: left.fragment, end: match.end, start: match.start };
      if (!bestRange || isBetterRange(candidate, bestRange)) {
        bestRange = candidate;
      }
    }
  }
  return bestRange;
}

function findNearbyMatches(leftIndexes: number[], rightIndexes: number[]) {
  const matches: Array<{ start: number; end: number }> = [];
  for (const start of leftIndexes) {
    for (const end of rightIndexes) {
      if (Math.abs(end - start) > 1) {
        continue;
      }
      matches.push({ start: Math.min(start, end), end: Math.max(start, end) });
      if (matches.length > 1) {
        return matches;
      }
    }
  }
  return matches;
}

function isBetterRange(
  candidate: { end: number; start: number },
  bestRange: { end: number; start: number }
) {
  const bestSpan = bestRange.end - bestRange.start;
  const candidateSpan = candidate.end - candidate.start;
  return candidateSpan < bestSpan || (candidateSpan === bestSpan && candidate.start < bestRange.start);
}
