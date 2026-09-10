import { buildCanonicalAttachmentKey, canonicalAttachmentExtension } from '../../lib/platform/canonicalAttachmentKey.js';
import type { SqliteDatabase } from '../database/connection.js';

import { inventoryAttachmentFiles, type AttachmentFileEvidence } from './canonicalAttachmentPreflightFiles.js';
import {
  collectAttachmentReferenceIndex, collectDirectReferences, versionMentionsAttachment,
  type AttachmentReferenceEvidence
} from './canonicalAttachmentPreflightReferences.js';

export type CanonicalAttachmentPreflightDecision =
  | 'canonicalize'
  | 'image_mime_repair'
  | 'known_missing'
  | 'no_bytes_unresolved'
  | 'html_orphan_delete'
  | 'residual_blocker';

interface AttachmentRow {
  attachment_id: string;
  attachment_mime_type: string | null;
  availability: string | null;
  blob_mime_type: string | null;
  content_hash: string | null;
  created_at: string;
  original_name: string | null;
  size_bytes: number | null;
  storage_key: string | null;
}

export interface CanonicalAttachmentPreflightItem {
  aliases: AttachmentFileEvidence[];
  attachmentId: string;
  canonicalStorageKey: string | null;
  decision: CanonicalAttachmentPreflightDecision;
  detectedKind: AttachmentFileEvidence['kind'] | null;
  references: AttachmentReferenceEvidence;
  residualReasons: string[];
  row: AttachmentRow;
  source: AttachmentFileEvidence | null;
}

export interface CanonicalAttachmentJournalPlan {
  items: Array<{
    attachmentId: string;
    decision: Exclude<CanonicalAttachmentPreflightDecision, 'residual_blocker' | 'no_bytes_unresolved'>;
    sourceIdentity: AttachmentFileEvidence | null;
    storageKeyAfter: string | null;
    stagedAliases: AttachmentFileEvidence[];
  }>;
  stage: 'planned';
  version: 1;
}

export interface CanonicalAttachmentMigrationPlan {
  assetsRoot: string;
  files: AttachmentFileEvidence[];
  items: CanonicalAttachmentPreflightItem[];
  journalPlan: CanonicalAttachmentJournalPlan;
  residualBlockers: Array<{ attachmentId: string; reasons: string[] }>;
  unsupportedEntries: string[];
  version: 2;
}

function attachmentRows(sqlite: SqliteDatabase) {
  return sqlite.prepare(`SELECT a.id AS attachment_id, a.original_name, a.mime_type AS attachment_mime_type,
    a.size_bytes, a.created_at, b.content_hash, b.storage_key, b.mime_type AS blob_mime_type, b.availability
    FROM attachments a LEFT JOIN attachment_blobs b ON b.attachment_id = a.id ORDER BY a.id`).all() as AttachmentRow[];
}

function initialNames(row: AttachmentRow) {
  const values = [row.attachment_id, row.content_hash, row.storage_key];
  for (const mime of [row.attachment_mime_type, row.blob_mime_type]) {
    const extension = canonicalAttachmentExtension(mime);
    if (row.content_hash && extension) values.push(`${row.content_hash}${extension}`);
  }
  return new Set(values.filter((value): value is string => Boolean(value)));
}

function mergeReferences(
  row: AttachmentRow,
  names: ReadonlySet<string>,
  index: ReturnType<typeof collectAttachmentReferenceIndex>
): AttachmentReferenceEvidence {
  const result: AttachmentReferenceEvidence = {
    externalDocuments: [], importSourceOriginalFiles: index.importSourceOriginalFiles.get(row.attachment_id) ?? [],
    invalidImportSourceStates: index.invalidImportSourceStates,
    nodeAttachments: [], nodeBodies: [], nodeSyncVersions: [], pdfPageCount: 0
  };
  for (const name of names) {
    const refs = index.targetIndex.get(name);
    if (!refs) continue;
    result.externalDocuments.push(...refs.externalDocuments);
    result.nodeBodies.push(...refs.nodeBodies);
    result.nodeSyncVersions.push(...refs.nodeSyncVersions);
  }
  for (const version of index.versions) {
    if (versionMentionsAttachment(version.snapshot_json, row.attachment_id)) {
      result.nodeSyncVersions.push({ objectId: version.object_id, target: row.attachment_id, versionId: version.version_id });
    }
  }
  return result;
}

function referenceCount(references: AttachmentReferenceEvidence) {
  return references.externalDocuments.length + references.importSourceOriginalFiles.length +
    references.invalidImportSourceStates.length + references.nodeAttachments.length + references.nodeBodies.length +
    references.nodeSyncVersions.length + references.pdfPageCount;
}

function classifyItem(row: AttachmentRow, aliases: AttachmentFileEvidence[], references: AttachmentReferenceEvidence) {
  const residualReasons: string[] = [];
  const expectedHash = row.content_hash;
  const hashes = [...new Set(aliases.map((file) => file.sha256))];
  if (hashes.length > 1) residualReasons.push('finite_aliases_have_different_content');
  if (expectedHash && aliases.some((file) => file.sha256 !== expectedHash)) residualReasons.push('alias_hash_mismatch');
  const source = aliases.find((file) => !expectedHash || file.sha256 === expectedHash) ?? null;
  if (!source) {
    const supported = buildCanonicalAttachmentKey(expectedHash, row.attachment_mime_type);
    return { canonicalStorageKey: supported, decision: supported ? 'known_missing' : 'no_bytes_unresolved',
      detectedKind: null, residualReasons, source } as const;
  }
  const detectedKind = source.kind;
  const actualHash = expectedHash ?? source.sha256;
  const canonicalStorageKey = detectedKind === 'approved_html' || detectedKind === 'unknown'
    ? null : buildCanonicalAttachmentKey(actualHash, detectedKind);
  if (aliases.some((file) => file.kind !== detectedKind)) residualReasons.push('finite_aliases_have_different_signatures');
  if (detectedKind === 'approved_html') {
    if (referenceCount(references) > 0) residualReasons.push('html_has_authoritative_reference');
    return { canonicalStorageKey: null,
      decision: residualReasons.length ? 'residual_blocker' : 'html_orphan_delete',
      detectedKind, residualReasons, source } as const;
  }
  if (!canonicalStorageKey) residualReasons.push('bytes_not_positively_classified');
  const target = aliases.find((file) => file.name === canonicalStorageKey);
  if (target && target.sha256 !== actualHash) residualReasons.push('canonical_target_conflict');
  if (residualReasons.length) {
    return { canonicalStorageKey, decision: 'residual_blocker', detectedKind, residualReasons, source } as const;
  }
  const mimeMismatch = row.attachment_mime_type !== detectedKind || row.blob_mime_type !== detectedKind;
  const repairable = detectedKind.startsWith('image/') &&
    Boolean(canonicalAttachmentExtension(row.attachment_mime_type) || canonicalAttachmentExtension(row.blob_mime_type));
  if (mimeMismatch && !repairable) residualReasons.push('declared_mime_not_repairable_from_supported_image');
  return { canonicalStorageKey,
    decision: residualReasons.length ? 'residual_blocker' : mimeMismatch ? 'image_mime_repair' : 'canonicalize',
    detectedKind, residualReasons, source } as const;
}

export function buildCanonicalAttachmentMigrationPlan(sqlite: SqliteDatabase, assetsDir: string) {
  const inventory = inventoryAttachmentFiles(assetsDir);
  const rows = attachmentRows(sqlite);
  const byName = new Map(inventory.files.map((file) => [file.name, file]));
  const byHash = new Map<string, AttachmentFileEvidence[]>();
  for (const file of inventory.files) byHash.set(file.sha256, [...(byHash.get(file.sha256) ?? []), file]);
  const referenceIndex = collectAttachmentReferenceIndex(sqlite);
  const items = rows.map((row): CanonicalAttachmentPreflightItem => {
    const names = initialNames(row);
    for (const file of row.content_hash ? byHash.get(row.content_hash) ?? [] : []) names.add(file.name);
    const aliases = [...names].flatMap((name) => byName.get(name) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    const direct = collectDirectReferences(sqlite, row.attachment_id);
    const references = mergeReferences(row, names, referenceIndex);
    references.nodeAttachments = direct.nodeAttachments;
    references.pdfPageCount = direct.pdfPageCount;
    return { aliases, attachmentId: row.attachment_id, references, row, ...classifyItem(row, aliases, references) };
  });
  const ownersByFile = new Map<string, CanonicalAttachmentPreflightItem[]>();
  for (const item of items) {
    for (const alias of item.aliases) ownersByFile.set(alias.name, [...(ownersByFile.get(alias.name) ?? []), item]);
  }
  for (const [fileName, owners] of ownersByFile) {
    if (owners.length < 2) continue;
    for (const item of owners) {
      item.decision = 'residual_blocker';
      item.residualReasons.push(`alias_has_multiple_attachment_owners:${fileName}`);
    }
  }
  const residualBlockers = items.filter((item) => item.decision === 'residual_blocker')
    .map((item) => ({ attachmentId: item.attachmentId, reasons: item.residualReasons }));
  const journalPlan: CanonicalAttachmentJournalPlan = { items: items.flatMap((item) =>
    item.decision === 'residual_blocker' || item.decision === 'no_bytes_unresolved' ? [] : [{
      attachmentId: item.attachmentId, decision: item.decision, sourceIdentity: item.source,
      stagedAliases: item.aliases.filter((file) => file.name !== item.canonicalStorageKey),
      storageKeyAfter: item.canonicalStorageKey
    }]), stage: 'planned', version: 1 };
  return { assetsRoot: inventory.root, files: inventory.files, items, journalPlan,
    residualBlockers, unsupportedEntries: inventory.unsupportedEntries, version: 2 } satisfies CanonicalAttachmentMigrationPlan;
}
