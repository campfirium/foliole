import { normalizeReadwiseText } from '../../lib/core/import/readwiseReaderParsing.js';
import type { PreparedReadwiseApiAnnotation } from '../../lib/core/readwise/readwiseApiImport.js';
import type { ReadwiseRemoteAnnotationBinding } from '../../lib/core/readwise/readwiseRemoteIdentity.js';

export interface LegacyAnnotationCandidate {
  [column: string]: unknown;
  anchorLink: string | null;
  childCount: number;
  content: string;
  createdAt: string;
  id: string;
  isTitleManual: number;
  title: string;
}

interface ParsedAnchor {
  id?: unknown;
  kind?: unknown;
  locator?: { originalText?: unknown };
}

export function matchReadwiseCutoverAnnotations(
  candidates: LegacyAnnotationCandidate[],
  annotations: PreparedReadwiseApiAnnotation[],
  blockedIds: ReadonlySet<string>
) {
  const available = candidates.filter(isHighlightCandidate);
  const claimed = new Set<string>();
  const bindings: ReadwiseRemoteAnnotationBinding[] = [];
  for (const annotation of annotations) {
    if (blockedIds.has(annotation.remoteId) || !annotation.locatorText?.trim()) continue;
    const matched = chooseCandidate(
      available.filter((candidate) => !claimed.has(candidate.id)),
      annotation.locatorText
    );
    if (!matched) continue;
    claimed.add(matched.id);
    bindings.push({ kind: annotation.kind, nodeId: matched.id, remoteId: annotation.remoteId });
  }
  return bindings;
}

function chooseCandidate(candidates: LegacyAnnotationCandidate[], remoteText: string) {
  const exact = candidates.filter((candidate) => candidateText(candidate) === remoteText);
  const normalized = exact.length ? exact : candidates.filter((candidate) => (
    canonicalText(candidateText(candidate)) === canonicalText(remoteText)
  ));
  const contained = normalized.length ? normalized : candidates.filter((candidate) => (
    uniquelyComparableText(candidateText(candidate), remoteText)
  ));
  if (contained.length === 1) return contained[0]!;
  if (contained.length === 0) return null;
  const imported = contained.filter(isImportedCandidate);
  const pool = imported.length ? imported : contained;
  const withChildren = pool.filter((candidate) => candidate.childCount > 0);
  if (withChildren.length === 1) return withChildren[0]!;
  if (pool.every(isImportedCandidate)) {
    return [...pool].sort((left, right) => (
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
    ))[0] ?? null;
  }
  return null;
}

function uniquelyComparableText(local: string, remote: string) {
  const left = canonicalText(local);
  const right = canonicalText(remote);
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  return shorter.length >= 24 && longer.includes(shorter);
}

function canonicalText(value: string) {
  return normalizeReadwiseText(value
    .replace(/\\([\\`*_[\]{}()#+\-.!])/gu, '$1')
    .replace(/^[ \t]*[•◦·]\s*/gmu, '- ')
    .replace(/<((?:https?:\/\/)[^>]+)>/giu, '$1 '));
}

function isHighlightCandidate(candidate: LegacyAnnotationCandidate) {
  if (candidate.isTitleManual !== 0) return false;
  const kind = parsedAnchor(candidate.anchorLink)?.kind;
  return kind !== 'cloze' && kind !== 'image_region';
}

function isImportedCandidate(candidate: LegacyAnnotationCandidate) {
  const id = parsedAnchor(candidate.anchorLink)?.id;
  return typeof id === 'string' && id.startsWith('imported-highlight-');
}

export function candidateText(candidate: LegacyAnnotationCandidate) {
  const original = parsedAnchor(candidate.anchorLink)?.locator?.originalText;
  return typeof original === 'string' && original.trim()
    ? original : candidate.content.trim() ? candidate.content : candidate.title;
}

function parsedAnchor(value: string | null): ParsedAnchor | null {
  if (!value) return null;
  try { return JSON.parse(value) as ParsedAnchor; } catch { return null; }
}
