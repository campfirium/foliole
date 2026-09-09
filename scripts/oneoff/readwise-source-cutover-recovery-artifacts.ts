import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { extractReadwiseSidecarHighlights, normalizeReadwiseText } from '../../lib/core/import/readwiseReaderParsing.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';

import { recursiveNodeRows } from './readwise-source-cutover-recovery-snapshot.js';
import type {
  RecoveryArtifact,
  RecoveryBinding,
  RecoveryCandidate,
  RecoveryClassification,
  RecoveryWrongSourceRow
} from './readwise-source-cutover-recovery-types.js';

export async function buildRecoveryBindings(input: {
  candidates: RecoveryCandidate[];
  driver: DatabaseDriver;
  sourceHost: string;
  wrongSources: RecoveryWrongSourceRow[];
}) {
  const artifacts = [
    ...await loadSourceArtifacts(input.driver, input.sourceHost),
    ...await loadBookArtifacts(input.driver)
  ];
  return input.candidates.map((candidate) =>
    classifyCandidate(input.driver, candidate, artifacts, input.wrongSources)
  );
}

async function loadSourceArtifacts(driver: DatabaseDriver, hostName: string) {
  const rows = driver.queryAll<{
    highlight_path: string; latest_node_id: string; root_path: string;
    source_fingerprint: string; source_location: string;
  }>(
    "SELECT i.source_fingerprint, i.latest_node_id, i.source_location, d.root_path, " +
      "json_extract(d.type_settings_json, '$.highlightPath') highlight_path " +
      'FROM import_sources i JOIN desktop_sources d ON d.source_ref = i.source_ref ' +
      "WHERE d.source_type = 'readwise' AND d.host_name = ? AND i.latest_node_id IS NOT NULL " +
      'AND i.source_location IS NOT NULL AND i.remote_document_id IS NULL ORDER BY i.source_fingerprint',
    [hostName]
  );
  return Promise.all(rows.map(async (row): Promise<RecoveryArtifact> => {
    const full = await readText(path.resolve(row.root_path, row.source_location));
    const raw = row.highlight_path
      ? await readText(path.resolve(row.highlight_path, row.source_location))
      : '';
    return {
      documentIds: new Set(readerIds(full)),
      highlightIds: readerIds(raw),
      nodeId: row.latest_node_id,
      raw,
      sourceFingerprint: row.source_fingerprint
    };
  }));
}

async function loadBookArtifacts(driver: DatabaseDriver): Promise<RecoveryArtifact[]> {
  const state = settingJson(driver, 'readwise_books_inventory_state') as Record<string, unknown>;
  const inventories = state.inventories && typeof state.inventories === 'object'
    ? Object.values(state.inventories as Record<string, unknown>)
    : [];
  const result: RecoveryArtifact[] = [];
  for (const item of inventories) {
    const inventory = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    for (const value of Array.isArray(inventory.books) ? inventory.books : []) {
      const book = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      if (typeof book.generatedNodeId !== 'string') continue;
      const full = await readText(
        typeof book.fullDocumentMarkdownPath === 'string' ? book.fullDocumentMarkdownPath : ''
      );
      const raw = await readText(
        typeof book.highlightMarkdownPath === 'string' ? book.highlightMarkdownPath : ''
      );
      result.push({
        documentIds: new Set(readerIds(full)),
        highlightIds: readerIds(raw),
        nodeId: book.generatedNodeId,
        raw,
        sourceFingerprint: null
      });
    }
  }
  return result;
}

function classifyCandidate(
  driver: DatabaseDriver,
  candidate: RecoveryCandidate,
  artifacts: RecoveryArtifact[],
  wrongSources: RecoveryWrongSourceRow[]
): RecoveryBinding {
  const highlights = new Set(candidate.highlightIds);
  const matches = artifacts.filter((artifact) => artifact.documentIds.has(candidate.documentId) ||
    artifact.highlightIds.some((id) => highlights.has(id)))
    .filter((artifact, index, list) =>
      list.findIndex((item) => item.nodeId === artifact.nodeId) === index
    );
  const wrong = wrongSources.find((item) => item.remote_document_id === candidate.documentId) ?? null;
  if (matches.length === 0) return suppressedBinding(candidate, wrong);
  if (matches.length !== 1) throw new Error('readwise_recovery_identity_conflict:' + candidate.documentId);
  const artifact = matches[0]!;
  return {
    annotations: classifyAnnotations(driver, candidate, artifact),
    nodeId: artifact.nodeId,
    remoteId: candidate.documentId,
    status: 'bound',
    targetSourceFingerprint: artifact.sourceFingerprint,
    wrongRootNodeId: wrong?.latest_node_id ?? null,
    wrongSourceFingerprint: wrong?.source_fingerprint ?? null
  };
}

function suppressedBinding(
  candidate: RecoveryCandidate,
  wrong: RecoveryWrongSourceRow | null
): RecoveryBinding {
  return {
    annotations: candidate.highlightIds.map((remoteId) => ({
      nodeId: null, remoteId, status: 'suppressed'
    })),
    nodeId: null,
    remoteId: candidate.documentId,
    status: 'suppressed',
    targetSourceFingerprint: null,
    wrongRootNodeId: wrong?.latest_node_id ?? null,
    wrongSourceFingerprint: wrong?.source_fingerprint ?? null
  };
}

function classifyAnnotations(
  driver: DatabaseDriver,
  candidate: RecoveryCandidate,
  artifact: RecoveryArtifact
) {
  const parsed = extractReadwiseSidecarHighlights(artifact.raw, createDefaultReadwiseReaderConfig());
  const children = recursiveNodeRows(driver, [artifact.nodeId]);
  return candidate.highlightIds.map((remoteId): RecoveryClassification => {
    const index = artifact.highlightIds.indexOf(remoteId);
    const text = index >= 0 ? parsed[index]?.text ?? '' : '';
    const matches = text
      ? children.filter((row) => row.is_title_manual === 0 &&
        normalizeReadwiseText(row.content) === normalizeReadwiseText(text))
      : [];
    return matches.length === 1
      ? { nodeId: matches[0]!.id, remoteId, status: 'bound' }
      : { nodeId: null, remoteId, status: 'suppressed' };
  });
}

function settingJson(driver: DatabaseDriver, key: string) {
  const value = driver.queryOne<{ value: string }>('SELECT value FROM settings WHERE key=?', [key])?.value;
  if (!value) throw new Error('readwise_recovery_setting_missing:' + key);
  return JSON.parse(value) as unknown;
}

function readerIds(value: string) {
  const pattern = /https?:\/\/(?:read\.)?readwise\.io\/(?:[^\s/()]+\/)?read\/([A-Za-z0-9_-]+)/giu;
  return [...new Set([...value.matchAll(pattern)].map((match) => match[1]!).filter(Boolean))];
}

async function readText(filePath: string) {
  if (!filePath) return '';
  try { return await fs.readFile(filePath, 'utf8'); } catch { return ''; }
}
