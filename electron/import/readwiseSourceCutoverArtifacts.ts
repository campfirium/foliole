import fs from 'node:fs/promises';
import path from 'node:path';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { extractReaderLinkIds } from '../../lib/core/readwise/readwiseRemoteIdentity.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import {
  listReadwiseLegacySourceDispositions,
  type ReadwiseLegacySourceDisposition
} from '../database/readwiseLegacySourceDispositions.js';

interface SourceRow extends DatabaseRow {
  highlight_path: string;
  latest_node_id: string;
  node_active: number;
  root_path: string;
  remote_document_id: string | null;
  source_fingerprint: string;
  source_location: string;
  source_ref: string;
}

export interface ReadwiseSourceArtifact {
  disposition: ReadwiseLegacySourceDisposition | null;
  documentIds: Set<string>;
  highlightIds: Set<string>;
  latestNodeId: string;
  nodeActive: boolean;
  raw: string;
  sourceFingerprint: string | null;
}

export async function loadReadwiseSourceArtifacts(): Promise<ReadwiseSourceArtifact[]> {
  return [...await loadFolderArtifacts(), ...await loadBookArtifacts()];
}

async function loadFolderArtifacts() {
  const driver = openDatabaseConnection().driver;
  const dispositionsByPath = new Map<string, ReadwiseLegacySourceDisposition[]>();
  for (const disposition of listReadwiseLegacySourceDispositions(driver)) {
    const key = sourcePathKey(disposition.ruleId, disposition.sourcePath);
    dispositionsByPath.set(key, [...(dispositionsByPath.get(key) ?? []), disposition]);
  }
  const rows = driver.queryAll<SourceRow>(
    `SELECT i.source_fingerprint, i.latest_node_id, i.source_location, i.source_ref,
       i.remote_document_id, d.root_path,
       EXISTS(SELECT 1 FROM nodes n WHERE n.id = i.latest_node_id AND n.deleted_at IS NULL) AS node_active,
       json_extract(d.type_settings_json, '$.highlightPath') AS highlight_path
     FROM import_sources i JOIN desktop_sources d ON d.source_ref = i.source_ref
     WHERE d.source_type = 'readwise' AND d.host_name = ?
       AND i.latest_node_id IS NOT NULL AND i.source_location IS NOT NULL
     ORDER BY i.source_fingerprint`,
    [loadReadwiseHostAssignment().current_host_name]
  );
  return Promise.all(rows.map(async (source): Promise<ReadwiseSourceArtifact> => {
    const relative = safeRelative(source.source_location);
    const ruleId = source.source_ref.startsWith('readwise:') ? source.source_ref.slice('readwise:'.length) : '';
    const dispositions = relative ? dispositionsByPath.get(sourcePathKey(ruleId, relative)) ?? [] : [];
    if (dispositions.length > 1) throw new Error('readwise_source_disposition_identity_conflict');
    const full = relative ? await readText(path.resolve(source.root_path, relative)) : '';
    const raw = relative && source.highlight_path
      ? await readText(path.resolve(source.highlight_path, relative)) : '';
    return {
      disposition: dispositions[0] ?? null,
      documentIds: new Set([...extractReaderLinkIds(full), ...(source.remote_document_id
        ? [source.remote_document_id] : [])]),
      highlightIds: new Set(extractReaderLinkIds(raw)),
      latestNodeId: source.latest_node_id,
      nodeActive: source.node_active === 1,
      raw,
      sourceFingerprint: source.source_fingerprint
    };
  }));
}

async function loadBookArtifacts(): Promise<ReadwiseSourceArtifact[]> {
  const driver = openDatabaseConnection().driver;
  const value = driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'readwise_books_inventory_state'"
  )?.value;
  if (!value) return [];
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(value) as Record<string, unknown>; } catch { return []; }
  const inventories = payload.inventories && typeof payload.inventories === 'object'
    ? Object.values(payload.inventories as Record<string, unknown>) : [];
  const artifacts: ReadwiseSourceArtifact[] = [];
  for (const entry of inventories) {
    const inventory = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    for (const item of Array.isArray(inventory.books) ? inventory.books : []) {
      const book = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      if (typeof book.generatedNodeId !== 'string' || !isActiveNode(book.generatedNodeId)) continue;
      const full = await readText(typeof book.fullDocumentMarkdownPath === 'string' ? book.fullDocumentMarkdownPath : '');
      const raw = await readText(typeof book.highlightMarkdownPath === 'string' ? book.highlightMarkdownPath : '');
      const remote = driver.queryOne<{ remote_document_id: string }>(
        `SELECT remote_document_id FROM import_sources WHERE latest_node_id = ?
         AND remote_provider = 'readwise' AND remote_document_id IS NOT NULL`,
        [book.generatedNodeId]
      );
      artifacts.push({
        disposition: null,
        documentIds: new Set([...extractReaderLinkIds(full), ...(remote ? [remote.remote_document_id] : [])]),
        highlightIds: new Set(extractReaderLinkIds(raw)),
        latestNodeId: book.generatedNodeId,
        nodeActive: true,
        raw,
        sourceFingerprint: null
      });
    }
  }
  return artifacts;
}

function isActiveNode(nodeId: string) {
  return Boolean(openDatabaseConnection().driver.queryOne(
    'SELECT id FROM nodes WHERE id = ? AND deleted_at IS NULL',
    [nodeId]
  ));
}

function safeRelative(value: string) {
  const normalized = normalizeRelative(value);
  return !normalized || normalized === '..' || normalized.startsWith('../') || path.isAbsolute(normalized)
    ? null : normalized;
}

function normalizeRelative(value: string) {
  return value.replaceAll('\\', '/').replace(/^\.\//u, '');
}

function sourcePathKey(ruleId: string, sourcePath: string) {
  return `${ruleId}\u0000${normalizeRelative(sourcePath)}`;
}

async function readText(filePath: string) {
  if (!filePath) return '';
  try { return await fs.readFile(filePath, 'utf8'); } catch { return ''; }
}
