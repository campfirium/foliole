import {
  resolveReaderBodyAncestor,
  type ReaderDocumentContract
} from '../../lib/core/readwise/readwiseApiContract.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';

import type { ReadwiseSourceArtifact } from './readwiseSourceCutoverArtifacts.js';

export interface ReadwiseLegacyMatchFailure {
  nodeId: string;
  reason: 'category_mismatch' | 'identity_conflict' | 'title_not_unique' | 'unmatched' | 'url_not_unique';
}

export function matchReadwiseSourceCutover(input: {
  artifacts: ReadwiseSourceArtifact[];
  preparedDocuments: PreparedReadwiseApiDocument[];
  readerDocuments: ReaderDocumentContract[];
}) {
  const artifacts = groupReadwiseSourceArtifacts(input.artifacts)
    .filter((item) => item.nodeActive && !item.disposition);
  const preparedById = new Map(input.preparedDocuments.map((item) => [item.id, item]));
  const readersById = new Map(input.readerDocuments.map((item) => [item.id, item]));
  const matches = new Map<string, ReadwiseSourceArtifact>();
  const failures = new Map<string, ReadwiseLegacyMatchFailure['reason']>();
  matchByIdentity(artifacts, readersById, preparedById, matches, failures);
  matchUnique(artifacts, input.preparedDocuments, matches, failures, 'url');
  matchUnique(artifacts, input.preparedDocuments, matches, failures, 'title');
  return {
    artifactFor: (documentId: string) => matches.get(documentId) ?? null,
    failures: artifacts.filter((item) => ![...matches.values()].includes(item)).map((item) => ({
      nodeId: item.latestNodeId,
      reason: failures.get(item.latestNodeId) ?? 'unmatched'
    } satisfies ReadwiseLegacyMatchFailure)),
    matchedDocumentIds: new Set(matches.keys())
  };
}

function matchByIdentity(
  artifacts: ReadwiseSourceArtifact[],
  readersById: ReadonlyMap<string, ReaderDocumentContract>,
  preparedById: ReadonlyMap<string, PreparedReadwiseApiDocument>,
  matches: Map<string, ReadwiseSourceArtifact>,
  failures: Map<string, ReadwiseLegacyMatchFailure['reason']>
) {
  const claimed = new Map<string, ReadwiseSourceArtifact[]>();
  for (const artifact of artifacts) {
    const ids = new Set([...artifact.documentIds, ...artifact.highlightIds].flatMap((id) => {
      const resolved = resolveReaderBodyAncestor(id, readersById).documentId;
      return resolved && preparedById.has(resolved) ? [resolved] : [];
    }));
    if (ids.size > 1) failures.set(artifact.latestNodeId, 'identity_conflict');
    if (ids.size !== 1) continue;
    const id = [...ids][0]!;
    claimed.set(id, [...(claimed.get(id) ?? []), artifact]);
  }
  for (const [documentId, candidates] of claimed) {
    if (candidates.length === 1) matches.set(documentId, candidates[0]!);
    else for (const artifact of candidates) failures.set(artifact.latestNodeId, 'identity_conflict');
  }
}

function matchUnique(
  artifacts: ReadwiseSourceArtifact[],
  documents: PreparedReadwiseApiDocument[],
  matches: Map<string, ReadwiseSourceArtifact>,
  failures: Map<string, ReadwiseLegacyMatchFailure['reason']>,
  kind: 'title' | 'url'
) {
  const matchedArtifacts = new Set(matches.values());
  const availableArtifacts = artifacts.filter((item) => !matchedArtifacts.has(item)
    && !failures.has(item.latestNodeId));
  const availableDocuments = documents.filter((item) => !matches.has(item.id));
  const artifactGroups = groupBy(availableArtifacts, (item) => matchKey(kind, item));
  const documentGroups = groupBy(availableDocuments, (item) => documentMatchKey(kind, item));
  for (const [key, candidates] of artifactGroups) {
    if (!key) continue;
    const remote = documentGroups.get(key) ?? [];
    if (candidates.length === 1 && remote.length === 1) {
      matches.set(remote[0]!.id, candidates[0]!);
      continue;
    }
    if (remote.length === 0) continue;
    const reason = kind === 'url' ? 'url_not_unique' : 'title_not_unique';
    for (const artifact of candidates) failures.set(artifact.latestNodeId, reason);
  }
}

function matchKey(kind: 'title' | 'url', artifact: ReadwiseSourceArtifact) {
  if (kind === 'url') return normalizeUrl(artifact.originalUrl);
  const category = artifact.sourceCategory;
  const title = normalizeTitle(artifact.title);
  return category && title ? `${category}\u0000${title}` : '';
}

function documentMatchKey(kind: 'title' | 'url', document: PreparedReadwiseApiDocument) {
  if (kind === 'url') return normalizeUrl(document.metadata.sourceUrl);
  const category = legacyCategory(document.category);
  const title = normalizeTitle(document.title);
  return category && title ? `${category}\u0000${title}` : '';
}

function normalizeUrl(value: string | null | undefined) {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLocaleLowerCase();
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/u, '');
    return url.toString();
  } catch {
    return '';
  }
}

function normalizeTitle(value: string | null | undefined) {
  return value?.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase() ?? '';
}

function legacyCategory(value: PreparedReadwiseApiDocument['category']) {
  if (value === 'article' || value === 'email' || value === 'rss') return 'articles';
  if (value === 'epub' || value === 'pdf') return 'books';
  if (value === 'tweet') return 'tweets';
  if (value === 'video') return 'podcasts';
  return null;
}

function groupBy<T>(values: T[], keyFor: (value: T) => string) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return groups;
}

export function groupReadwiseSourceArtifacts(values: ReadwiseSourceArtifact[]) {
  const groups = new Map<string, ReadwiseSourceArtifact>();
  for (const value of values) {
    const previous = groups.get(value.latestNodeId);
    groups.set(value.latestNodeId, previous ? {
      ...previous,
      disposition: previous.disposition ?? value.disposition,
      documentIds: new Set([...previous.documentIds, ...value.documentIds]),
      highlightIds: new Set([...previous.highlightIds, ...value.highlightIds]),
      nodeActive: previous.nodeActive || value.nodeActive,
      originalUrl: previous.originalUrl ?? value.originalUrl ?? null,
      raw: previous.raw.length >= value.raw.length ? previous.raw : value.raw,
      sourceCategory: previous.sourceCategory ?? value.sourceCategory ?? null,
      sourceFingerprint: previous.sourceFingerprint ?? value.sourceFingerprint,
      title: previous.title || value.title || ''
    } : value);
  }
  return [...groups.values()];
}
