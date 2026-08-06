import type { DbPort } from './dbPort.js';

const CONTENT_PACK_ALIAS = 'content_batch';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface CompanionAttachmentManifestEntry {
  attachmentId: string;
  contentHash: string;
  sizeBytes: number;
  storageKey: string;
}

export async function applyCompanionContentPack(
  port: DbPort,
  args: { failedHashes: string[]; now: string; packPath: string }
) {
  await port.run(`ATTACH DATABASE ${sqlString(args.packPath)} AS ${CONTENT_PACK_ALIAS}`);
  try {
    await assertContentPack(port);
    const accepted = await loadAcceptedContentHashes(port);
    const acceptedHashes = accepted.map(({ hash }) => hash);
    const failedHashes = uniqueHashes([...args.failedHashes, ...(await loadRejectedContentHashes(port))]);
    await port.transaction(async (tx) => {
      await tx.run(`INSERT OR REPLACE INTO content_blob_data (hash, data)
        SELECT pack.hash, pack.data
        FROM ${CONTENT_PACK_ALIAS}.content_blob_batch pack
        INNER JOIN content_blobs manifest ON manifest.hash = pack.hash
        WHERE manifest.compression = 'none'
          AND manifest.original_size_bytes = pack.size_bytes
          AND manifest.stored_size_bytes = pack.size_bytes
          AND manifest.original_sha256 = pack.hash
          AND manifest.stored_sha256 = pack.hash`);
      for (const hash of acceptedHashes) {
        await tx.run(
          "UPDATE content_blobs SET availability = 'cached', cached_at = ?, last_verified_at = ? WHERE hash = ?",
          [args.now, args.now, hash]
        );
      }
      for (const hash of failedHashes) {
        await tx.run("UPDATE content_blobs SET availability = 'failed' WHERE hash = ?", [hash]);
      }
    });
    return { failedHashes, syncedHashes: acceptedHashes };
  } finally {
    await port.run(`DETACH DATABASE ${CONTENT_PACK_ALIAS}`);
  }
}

export async function applyCompanionAttachmentManifest(
  port: DbPort,
  args: { entries: CompanionAttachmentManifestEntry[]; failedIds: string[]; now: string }
) {
  assertAttachmentEntries(args.entries);
  const syncedIds: string[] = [];
  const failedIds = new Set(args.failedIds);
  await port.transaction(async (tx) => {
    for (const entry of args.entries) {
      const rows = await tx.query<{ content_hash: unknown; size_bytes: unknown }>(
        'SELECT content_hash, size_bytes FROM attachment_blobs WHERE attachment_id = ? LIMIT 1',
        [entry.attachmentId]
      );
      if (rows[0]?.content_hash !== entry.contentHash || Number(rows[0]?.size_bytes) !== entry.sizeBytes) {
        failedIds.add(entry.attachmentId);
        continue;
      }
      await tx.run(
        "UPDATE attachment_blobs SET storage_key = ?, availability = 'cached', cached_at = ?, last_verified_at = ? WHERE attachment_id = ?",
        [entry.storageKey, args.now, args.now, entry.attachmentId]
      );
      syncedIds.push(entry.attachmentId);
    }
    for (const attachmentId of failedIds) {
      await tx.run("UPDATE attachment_blobs SET availability = 'failed' WHERE attachment_id = ?", [attachmentId]);
    }
  });
  return { failedIds: [...failedIds], syncedIds };
}

async function assertContentPack(port: DbPort) {
  const integrity = await port.query<Record<string, unknown>>(`PRAGMA ${CONTENT_PACK_ALIAS}.quick_check`);
  if (Object.values(integrity[0] ?? {})[0] !== 'ok') throw new Error('Content batch pack failed SQLite integrity check.');
  const columns = await port.query<{ name: unknown }>(`PRAGMA ${CONTENT_PACK_ALIAS}.table_info(content_blob_batch)`);
  const names = columns.map(({ name }) => name).filter((name): name is string => typeof name === 'string');
  if (JSON.stringify(names) !== JSON.stringify(['hash', 'size_bytes', 'data'])) {
    throw new Error('Content batch pack schema is invalid.');
  }
  const invalid = await port.query<{ count: unknown }>(`SELECT COUNT(*) AS count
    FROM ${CONTENT_PACK_ALIAS}.content_blob_batch
    WHERE length(hash) != 64 OR size_bytes < 0 OR length(data) != size_bytes`);
  if (Number(invalid[0]?.count ?? 0) !== 0) throw new Error('Content batch pack contains invalid rows.');
}

async function loadAcceptedContentHashes(port: DbPort) {
  return port.query<{ hash: string }>(`SELECT pack.hash
    FROM ${CONTENT_PACK_ALIAS}.content_blob_batch pack
    INNER JOIN content_blobs manifest ON manifest.hash = pack.hash
    WHERE manifest.compression = 'none'
      AND manifest.original_size_bytes = pack.size_bytes
      AND manifest.stored_size_bytes = pack.size_bytes
      AND manifest.original_sha256 = pack.hash
      AND manifest.stored_sha256 = pack.hash
    ORDER BY pack.hash`);
}

async function loadRejectedContentHashes(port: DbPort) {
  const rows = await port.query<{ hash: string }>(`SELECT pack.hash
    FROM ${CONTENT_PACK_ALIAS}.content_blob_batch pack
    LEFT JOIN content_blobs manifest ON manifest.hash = pack.hash
    WHERE manifest.hash IS NULL OR manifest.compression != 'none'
      OR manifest.original_size_bytes != pack.size_bytes OR manifest.stored_size_bytes != pack.size_bytes
      OR manifest.original_sha256 != pack.hash OR manifest.stored_sha256 != pack.hash`);
  return rows.map(({ hash }) => hash);
}

function assertAttachmentEntries(entries: CompanionAttachmentManifestEntry[]) {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry.attachmentId || ids.has(entry.attachmentId)) throw new Error('Attachment batch manifest has duplicate or empty ids.');
    if (!SHA256_PATTERN.test(entry.contentHash) || entry.storageKey !== entry.contentHash
      || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0) {
      throw new Error('Attachment batch manifest is invalid.');
    }
    ids.add(entry.attachmentId);
  }
}

function uniqueHashes(values: string[]) {
  return [...new Set(values.filter((value) => SHA256_PATTERN.test(value)))];
}

function sqlString(value: string) {
  if (!value.trim()) throw new Error('Content batch pack path is required.');
  return `'${value.replaceAll("'", "''")}'`;
}
