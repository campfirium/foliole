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

import { extractReadwiseSourceUrl } from './readwiseSourceCutoverSourceUrl.js';

interface SourceRow extends DatabaseRow {
  highlight_path: string;
  latest_node_id: string;
  node_active: number;
  root_path: string;
  remote_document_id: string | null;
  source_fingerprint: string;
  source_location: string;
  source_ref: string;
  source_title: string;
  type_settings_json: string;
}

export interface ReadwiseSourceArtifact {
  disposition: ReadwiseLegacySourceDisposition | null;
  documentIds: Set<string>;
  highlightIds: Set<string>;
  latestNodeId: string;
  nodeActive: boolean;
  originalUrl?: string | null;
  raw: string;
  sourceCategory?: 'articles' | 'books' | 'podcasts' | 'tweets' | null;
  sourceFingerprint: string | null;
  title?: string;
}

export async function loadReadwiseSourceArtifacts(): Promise<ReadwiseSourceArtifact[]> {
  return [...loadTrackedArtifacts(), ...await loadFolderArtifacts()];
}

function loadTrackedArtifacts(): ReadwiseSourceArtifact[] {
  const driver = openDatabaseConnection().driver;
  const dispositionsByPath = readDispositionsByPath(driver);
  const rows = driver.queryAll<{
    kind: string | null; last_node_id: string; raw: string; rule_id: string;
    node_active: number; source_fingerprint: string | null; source_path: string; title: string;
  }>(`SELECT item.rule_id,item.source_path,item.last_node_id,
      COALESCE(cache.content,cache.content_preview,'') raw,
      COALESCE(node.title,cache.title,'') title,
      CASE WHEN node.id IS NULL THEN 0 ELSE 1 END node_active,
      json_extract(desktop.type_settings_json, '$.kind') kind,
      (SELECT source_fingerprint FROM import_sources source
       WHERE source.latest_node_id=item.last_node_id AND source.remote_document_id IS NULL
       ORDER BY source.last_imported_at DESC LIMIT 1) source_fingerprint
    FROM keep_import_items item
    JOIN desktop_sources desktop ON desktop.config_ref=item.rule_id
      AND desktop.source_type='readwise' AND desktop.host_name=?
    LEFT JOIN keep_import_item_cache cache ON cache.rule_id=item.rule_id AND cache.source_path=item.source_path
    LEFT JOIN nodes node ON node.id=item.last_node_id AND node.deleted_at IS NULL
    WHERE item.last_node_id IS NOT NULL`,
  [loadReadwiseHostAssignment().current_host_name]);
  return rows.flatMap((row) => {
    const ids = new Set(extractReaderLinkIds(row.raw));
    const dispositions = dispositionsByPath.get(sourcePathKey(row.rule_id, row.source_path)) ?? [];
    if (dispositions.length > 1) throw new Error('readwise_source_disposition_identity_conflict');
    if (row.node_active !== 1 && !dispositions[0]) return [];
    return [{
      disposition: dispositions[0] ?? null,
      documentIds: ids,
      highlightIds: ids,
      latestNodeId: row.last_node_id,
      nodeActive: row.node_active === 1,
      originalUrl: extractReadwiseSourceUrl(row.raw),
      raw: row.raw,
      sourceCategory: sourceCategory(row.kind),
      sourceFingerprint: row.source_fingerprint,
      title: row.title
    }];
  });
}

async function loadFolderArtifacts() {
  const driver = openDatabaseConnection().driver;
  const dispositionsByPath = readDispositionsByPath(driver);
  const rows = driver.queryAll<SourceRow>(
    `SELECT i.source_fingerprint, i.latest_node_id, i.source_location, i.source_ref,
       i.remote_document_id, d.root_path,
       n.title source_title, d.type_settings_json,
       EXISTS(SELECT 1 FROM nodes n WHERE n.id = i.latest_node_id AND n.deleted_at IS NULL) AS node_active,
       json_extract(d.type_settings_json, '$.highlightPath') AS highlight_path
     FROM import_sources i JOIN desktop_sources d ON d.source_ref = i.source_ref
     LEFT JOIN nodes n ON n.id = i.latest_node_id
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
      originalUrl: extractReadwiseSourceUrl(full || raw),
      raw,
      sourceCategory: sourceCategory(parseKind(source.type_settings_json)),
      sourceFingerprint: source.source_fingerprint,
      title: source.source_title
    };
  }));
}

function readDispositionsByPath(driver: ReturnType<typeof openDatabaseConnection>['driver']) {
  const dispositionsByPath = new Map<string, ReadwiseLegacySourceDisposition[]>();
  for (const disposition of listReadwiseLegacySourceDispositions(driver)) {
    const key = sourcePathKey(disposition.ruleId, disposition.sourcePath);
    dispositionsByPath.set(key, [...(dispositionsByPath.get(key) ?? []), disposition]);
  }
  return dispositionsByPath;
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

function parseKind(value: string) {
  try {
    const parsed = JSON.parse(value) as { kind?: unknown };
    return typeof parsed.kind === 'string' ? parsed.kind : null;
  } catch {
    return null;
  }
}

function sourceCategory(value: string | null) {
  return value === 'articles' || value === 'books' || value === 'podcasts' || value === 'tweets'
    ? value : null;
}
