import {
  resolveReaderBodyAncestor,
  type ReaderDocumentContract
} from '../../lib/core/readwise/readwiseApiContract.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';

import type { ReadwiseSourceArtifact } from './readwiseSourceCutoverArtifacts.js';
import {
  extractReadwiseNumericDocumentId,
  extractReadwiseSourceUrl
} from './readwiseSourceCutoverSourceUrl.js';

export interface ReadwiseLegacyMatchFailure {
  nodeId: string;
  reason: 'identity_conflict' | 'unmatched' | 'url_not_unique';
}

export function matchReadwiseSourceCutover(input: {
  artifacts: ReadwiseSourceArtifact[];
  preparedDocuments: PreparedReadwiseApiDocument[];
  readerDocuments: ReaderDocumentContract[];
}) {
  const artifacts = groupReadwiseSourceArtifacts(input.artifacts)
    .filter((item) => item.nodeActive);
  const preparedById = new Map(input.preparedDocuments.map((item) => [item.id, item]));
  const readersById = new Map(input.readerDocuments.map((item) => [item.id, item]));
  const matches = new Map<string, ReadwiseSourceArtifact>();
  const failures = new Map<string, ReadwiseLegacyMatchFailure['reason']>();
  matchByIdentity(artifacts, readersById, preparedById, matches, failures);
  matchUniqueNumericDocumentId(artifacts, input.preparedDocuments, matches, failures);
  matchUniqueUrl(artifacts, input.preparedDocuments, matches, failures);
  return {
    artifactFor: (documentId: string) => matches.get(documentId) ?? null,
    failures: artifacts.filter((item) => ![...matches.values()].includes(item)).map((item) => ({
      nodeId: item.latestNodeId,
      reason: failures.get(item.latestNodeId) ?? 'unmatched'
    } satisfies ReadwiseLegacyMatchFailure)),
    matchedDocumentIds: new Set(matches.keys())
  };
}

function matchUniqueNumericDocumentId(
  artifacts: ReadwiseSourceArtifact[],
  documents: PreparedReadwiseApiDocument[],
  matches: Map<string, ReadwiseSourceArtifact>,
  failures: Map<string, ReadwiseLegacyMatchFailure['reason']>
) {
  const matchedArtifacts = new Set(matches.values());
  const availableArtifacts = artifacts.filter((item) => !matchedArtifacts.has(item)
    && !failures.has(item.latestNodeId));
  const availableDocuments = documents.filter((item) => !matches.has(item.id));
  const artifactGroups = groupBy(availableArtifacts, (item) =>
    extractReadwiseNumericDocumentId(item.raw) ?? '');
  const documentGroups = groupBy(availableDocuments, (item) =>
    extractReadwiseNumericDocumentId(item.rawSourceUrl) ?? '');
  for (const [key, candidates] of artifactGroups) {
    if (!key) continue;
    const remote = documentGroups.get(key) ?? [];
    if (candidates.length === 1 && remote.length === 1) {
      matches.set(remote[0]!.id, candidates[0]!);
      continue;
    }
    if (remote.length === 0) continue;
    for (const artifact of candidates) failures.set(artifact.latestNodeId, 'identity_conflict');
  }
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

function matchUniqueUrl(
  artifacts: ReadwiseSourceArtifact[],
  documents: PreparedReadwiseApiDocument[],
  matches: Map<string, ReadwiseSourceArtifact>,
  failures: Map<string, ReadwiseLegacyMatchFailure['reason']>
) {
  const matchedArtifacts = new Set(matches.values());
  const availableArtifacts = artifacts.filter((item) => !matchedArtifacts.has(item)
    && !failures.has(item.latestNodeId));
  const availableDocuments = documents.filter((item) => !matches.has(item.id));
  const artifactGroups = groupBy(availableArtifacts, (item) => normalizeUrl(item.originalUrl));
  const documentGroups = new Map<string, PreparedReadwiseApiDocument[]>();
  for (const document of availableDocuments) {
    for (const key of documentUrlKeys(document)) {
      documentGroups.set(key, [...(documentGroups.get(key) ?? []), document]);
    }
  }
  for (const [key, candidates] of artifactGroups) {
    if (!key) continue;
    const remote = documentGroups.get(key) ?? [];
    if (candidates.length === 1 && remote.length === 1) {
      matches.set(remote[0]!.id, candidates[0]!);
      continue;
    }
    if (remote.length === 0) continue;
    for (const artifact of candidates) failures.set(artifact.latestNodeId, 'url_not_unique');
  }
}

function documentUrlKeys(document: PreparedReadwiseApiDocument) {
  return new Set([
    normalizeUrl(document.metadata.sourceUrl),
    normalizeUrl(extractReadwiseSourceUrl(document.body))
  ].filter(Boolean));
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
