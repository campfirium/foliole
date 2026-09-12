export interface ReadwiseApiEpubMarkerInput {
  blockLevel: boolean;
  classSignature: string;
  content: string;
  depth: number;
  headingLevel: number | null;
  insideNavigation: boolean;
  markerKey: string;
  tagName: string;
  title: string | null;
}

export interface ReadwiseApiEpubCandidateAudit {
  accepted: boolean;
  finalCarrierKey: string | null;
  markerKey: string;
  naturalLevel: number | null;
  reason: string;
  tagName: string;
  title: string | null;
}

export interface ProjectedReadwiseApiEpubSection {
  content: string;
  headingLevel: number;
  markerKey: string;
  naturalLevel: number;
  title: string;
}

export function projectReadwiseApiEpubMarkers(input: {
  markers: ReadwiseApiEpubMarkerInput[];
  rootBody: string;
}) {
  const eligible = input.markers.map((marker) => eligibility(marker));
  const acceptedMarkers = input.markers.filter((_, index) => eligible[index]!.accepted);
  const levels = inferNaturalLevels(acceptedMarkers);
  const sections: ProjectedReadwiseApiEpubSection[] = [];
  const rootChunks = [input.rootBody];
  let acceptedIndex = 0;
  let currentSection: ProjectedReadwiseApiEpubSection | null = null;
  const candidates = input.markers.map((marker, index): ReadwiseApiEpubCandidateAudit => {
    const verdict = eligible[index]!;
    if (!verdict.accepted) {
      appendContent(currentSection, rootChunks, marker.content);
      return audit(marker, false, null, null, verdict.reason);
    }
    const naturalLevel = levels[acceptedIndex++]!;
    currentSection = {
      content: marker.content,
      headingLevel: naturalLevel,
      markerKey: marker.markerKey,
      naturalLevel,
      title: marker.title!
    };
    sections.push(currentSection);
    return audit(marker, true, naturalLevel <= 3 ? marker.markerKey : null, naturalLevel, verdict.reason);
  });
  assignDeepCarriers(candidates);
  return { candidates, rootBody: joinChunks(rootChunks), sections };
}

function eligibility(marker: ReadwiseApiEpubMarkerInput) {
  if (!marker.blockLevel) return { accepted: false, reason: 'rejected-inline-marker' };
  if (marker.insideNavigation) return { accepted: false, reason: 'rejected-navigation-copy' };
  if (!marker.title) return { accepted: false, reason: 'rejected-missing-structural-title' };
  if (!marker.content.trim()) return { accepted: false, reason: 'rejected-empty-boundary' };
  if (marker.headingLevel !== null) return { accepted: true, reason: 'accepted-block-heading' };
  return { accepted: true, reason: 'accepted-block-boundary' };
}

function inferNaturalLevels(markers: ReadwiseApiEpubMarkerInput[]) {
  const headingValues = [...new Set(markers.flatMap((marker) => (
    marker.headingLevel === null ? [] : [marker.headingLevel]
  )))].sort((left, right) => left - right);
  const headingRanks = new Map(headingValues.map((level, index) => [level, index + 1]));
  const unknown = markers.filter((marker) => marker.headingLevel === null);
  const signatureDepths = inferSignatureDepths(unknown);
  const unknownDepths = [...new Set(signatureDepths.values())].sort((a, b) => a - b);
  const inferUnknownHierarchy = headingValues.length === 1
    && unknownDepths.length >= 2
    && signatureDepths.size >= 2;
  const shallowestUnknown = unknownDepths[0] ?? 0;
  return markers.map((marker) => {
    if (marker.headingLevel !== null) return headingRanks.get(marker.headingLevel)!;
    const depth = signatureDepths.get(signature(marker)) ?? marker.depth;
    return inferUnknownHierarchy ? Math.min(6, 2 + depth - shallowestUnknown) : 1;
  });
}

function inferSignatureDepths(markers: ReadwiseApiEpubMarkerInput[]) {
  const signatures = new Map<string, number[]>();
  markers.forEach((marker) => {
    const key = signature(marker);
    signatures.set(key, [...(signatures.get(key) ?? []), marker.depth]);
  });
  return new Map([...signatures.entries()].flatMap(([key, depths]): Array<[string, number]> => {
    if (depths.length < 2) return [];
    const counts = new Map<number, number>();
    depths.forEach((depth) => counts.set(depth, (counts.get(depth) ?? 0) + 1));
    const mode = [...counts].sort((left, right) => right[1] - left[1])[0]!;
    return mode[1] / depths.length >= 0.9 ? [[key, mode[0]]] : [];
  }));
}

function signature(marker: ReadwiseApiEpubMarkerInput) {
  return marker.classSignature || marker.tagName;
}

function assignDeepCarriers(candidates: ReadwiseApiEpubCandidateAudit[]) {
  let carrier: string | null = null;
  candidates.forEach((candidate) => {
    if (!candidate.accepted || (candidate.naturalLevel ?? 0) > 3) {
      candidate.finalCarrierKey = carrier;
      return;
    }
    carrier = candidate.markerKey;
  });
}

function appendContent(
  current: ProjectedReadwiseApiEpubSection | null,
  rootChunks: string[],
  content: string
) {
  if (!content.trim()) return;
  if (current) current.content = joinChunks([current.content, content]);
  else rootChunks.push(content);
}

function audit(
  marker: ReadwiseApiEpubMarkerInput,
  accepted: boolean,
  finalCarrierKey: string | null,
  naturalLevel: number | null,
  reason: string
): ReadwiseApiEpubCandidateAudit {
  return {
    accepted, finalCarrierKey, markerKey: marker.markerKey, naturalLevel, reason,
    tagName: marker.tagName, title: marker.title
  };
}

function joinChunks(chunks: string[]) {
  return chunks.map((chunk) => chunk.trim()).filter(Boolean).join('\n\n');
}
