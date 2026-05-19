interface InlineCandidateSelectionRange {
  compatibility?: boolean;
  from: number;
  kind: string;
  to: number;
}

function isSameCandidate<T extends InlineCandidateSelectionRange>(left: T, right: T) {
  return left.from === right.from && left.to === right.to && left.kind === right.kind;
}

function isOverlappingRange(left: InlineCandidateSelectionRange, right: InlineCandidateSelectionRange) {
  return left.from < right.to && left.to > right.from;
}

function isOverlappingSameKind<T extends InlineCandidateSelectionRange>(left: T, right: T) {
  return left.kind === right.kind && isOverlappingRange(left, right);
}

export function overlapsInlineCandidateRange(left: InlineCandidateSelectionRange, right: InlineCandidateSelectionRange) {
  return isOverlappingRange(left, right);
}

export function selectInlineProjectionCandidates<T extends InlineCandidateSelectionRange>(candidates: T[]) {
  return candidates
    .sort((left, right) => (left.from === right.from ? right.to - left.to : left.from - right.from))
    .filter((candidate, index, items) => items.findIndex((item) => isSameCandidate(item, candidate)) === index)
    .reduce<T[]>((kept, candidate) => {
      if (!kept.some((item) => isOverlappingSameKind(item, candidate))) kept.push(candidate);
      return kept;
    }, []);
}
