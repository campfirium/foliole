import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../lib/core/import/markdownImageReferences.js';
import type { SqliteDatabase } from '../database/connection.js';

export interface AttachmentReferenceEvidence {
  externalDocuments: Array<{ documentId: string; target: string }>;
  importSourceOriginalFiles: Array<{ sourceFingerprint: string }>;
  invalidImportSourceStates: Array<{ sourceFingerprint: string }>;
  nodeAttachments: Array<{ deletedAt: string | null; nodeId: string; role: string }>;
  nodeBodies: Array<{ deletedAt: string | null; nodeId: string; target: string }>;
  nodeSyncVersions: Array<{ objectId: string; target: string; versionId: string }>;
  pdfPageCount: number;
}

interface BodyRow { content: string | Buffer | null; deleted_at?: string | null; id: string }
interface VersionRow { object_id: string; snapshot_json: string | null; version_id: string }
interface ImportSourceRow { remote_import_state_json: string; source_fingerprint: string }

function maskCode(markdown: string) {
  const result = [...markdown];
  let fence = false;
  let inline = false;
  for (let index = 0; index < result.length; index += 1) {
    if (markdown.startsWith('```', index)) {
      fence = !fence;
      result[index] = result[index + 1] = result[index + 2] = ' ';
      index += 2;
    } else if (!fence && result[index] === '`') {
      inline = !inline;
      result[index] = ' ';
    } else if ((fence || inline) && result[index] !== '\n') result[index] = ' ';
  }
  return result.join('');
}

function bodyText(value: string | Buffer | null) {
  return Buffer.isBuffer(value) ? value.toString('utf8') : value ?? '';
}

function assetTargets(value: string | Buffer | null) {
  const source = bodyText(value);
  return collectMarkdownImageReferences(maskCode(source)).flatMap((reference) => {
    const parsed = parseMarkdownImageTarget(reference.rawTarget);
    return parsed?.destination.startsWith('asset://') ? [parsed.destination.slice('asset://'.length)] : [];
  });
}

function resolvedNodeRows(sqlite: SqliteDatabase) {
  return sqlite.prepare(`SELECT n.id, n.deleted_at,
    CASE WHEN n.body_blob_hash IS NULL THEN n.content ELSE cbd.data END AS content
    FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash`).all() as BodyRow[];
}

export function collectAttachmentReferenceIndex(sqlite: SqliteDatabase) {
  const targetIndex = new Map<string, AttachmentReferenceEvidence>();
  const ensure = (key: string) => {
    let value = targetIndex.get(key);
    if (!value) {
      value = { externalDocuments: [], importSourceOriginalFiles: [], invalidImportSourceStates: [],
        nodeAttachments: [], nodeBodies: [], nodeSyncVersions: [], pdfPageCount: 0 };
      targetIndex.set(key, value);
    }
    return value;
  };
  for (const row of resolvedNodeRows(sqlite)) {
    for (const target of assetTargets(row.content)) {
      ensure(target).nodeBodies.push({ deletedAt: row.deleted_at ?? null, nodeId: row.id, target });
    }
  }
  const documents = sqlite.prepare(`SELECT ed.document_id AS id,
    CASE WHEN ed.body_blob_hash IS NULL THEN ed.content ELSE cbd.data END AS content
    FROM external_documents ed LEFT JOIN content_blob_data cbd ON cbd.hash = ed.body_blob_hash`).all() as BodyRow[];
  for (const row of documents) {
    for (const target of assetTargets(row.content)) ensure(target).externalDocuments.push({ documentId: row.id, target });
  }
  const versions = sqlite.prepare('SELECT version_id, object_id, snapshot_json FROM node_sync_versions').all() as VersionRow[];
  for (const row of versions) {
    for (const target of assetTargets(row.snapshot_json)) {
      ensure(target).nodeSyncVersions.push({ objectId: row.object_id, target, versionId: row.version_id });
    }
  }
  const importSourceOriginalFiles = new Map<string, AttachmentReferenceEvidence['importSourceOriginalFiles']>();
  const invalidImportSourceStates: AttachmentReferenceEvidence['invalidImportSourceStates'] = [];
  const sources = sqlite.prepare(
    'SELECT source_fingerprint, remote_import_state_json FROM import_sources ORDER BY source_fingerprint'
  ).all() as ImportSourceRow[];
  for (const source of sources) {
    try {
      const state = JSON.parse(source.remote_import_state_json) as { originalFile?: { attachmentId?: unknown } | null };
      const attachmentId = state?.originalFile?.attachmentId;
      if (typeof attachmentId !== 'string' || !attachmentId) continue;
      importSourceOriginalFiles.set(attachmentId, [
        ...(importSourceOriginalFiles.get(attachmentId) ?? []), { sourceFingerprint: source.source_fingerprint }
      ]);
    } catch {
      invalidImportSourceStates.push({ sourceFingerprint: source.source_fingerprint });
    }
  }
  return { ensure, importSourceOriginalFiles, invalidImportSourceStates, targetIndex, versions };
}

export function collectDirectReferences(sqlite: SqliteDatabase, attachmentId: string) {
  const nodeAttachments = sqlite.prepare(`SELECT na.node_id AS nodeId, na.role, n.deleted_at AS deletedAt
    FROM node_attachments na JOIN nodes n ON n.id = na.node_id WHERE na.attachment_id = ?
    ORDER BY na.node_id, na.role`).all(attachmentId) as AttachmentReferenceEvidence['nodeAttachments'];
  const pdf = sqlite.prepare('SELECT COUNT(*) AS count FROM pdf_page_text WHERE attachment_id = ?')
    .get(attachmentId) as { count: number };
  return { nodeAttachments, pdfPageCount: pdf.count };
}

export function versionMentionsAttachment(snapshot: string | null, attachmentId: string) {
  if (!snapshot) return false;
  try {
    const visit = (value: unknown): boolean => value === attachmentId ||
      (Array.isArray(value) ? value.some(visit) : Boolean(value) && typeof value === 'object' &&
        Object.values(value as Record<string, unknown>).some(visit));
    return visit(JSON.parse(snapshot));
  } catch {
    return false;
  }
}
