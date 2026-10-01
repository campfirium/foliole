import { createHash, randomUUID } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';

import { classifyAttachmentBytes } from '../../lib/platform/attachmentByteClassification.js';
import { buildCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import type { DesktopTaskContext } from '../desktopTaskTypes.js';

export interface VerifiedMigrationImage {
  contentHash: string;
  storageKey: string;
}

async function inspectImage(filePath: string, signal: AbortSignal): Promise<VerifiedMigrationImage | null> {
  const file = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!(await file.stat()).isFile()) throw new Error('image_migration_not_regular_file');
    const header = Buffer.alloc(128);
    await file.read(header, 0, header.length, 0);
    const kind = classifyAttachmentBytes(header);
    if (!kind.startsWith('image/')) return null;
    const hash = createHash('sha256');
    for await (const chunk of file.createReadStream({ autoClose: false, start: 0 })) {
      signal.throwIfAborted();
      hash.update(chunk);
    }
    const contentHash = hash.digest('hex');
    const storageKey = buildCanonicalAttachmentStorageKey(contentHash, kind);
    return storageKey ? { contentHash, storageKey } : null;
  } finally {
    await file.close();
  }
}

async function requireImage(filePath: string, image: VerifiedMigrationImage, signal: AbortSignal) {
  const actual = await inspectImage(filePath, signal);
  if (actual?.storageKey !== image.storageKey) throw new Error('image_migration_target_invalid');
}

async function ensureCanonicalFile(assetsDir: string, sourceKey: string,
  image: VerifiedMigrationImage, signal: AbortSignal) {
  const target = path.join(assetsDir, image.storageKey);
  try {
    await requireImage(target, image, signal);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const staged = path.join(assetsDir, `.image-address-migration-${randomUUID()}`);
  try {
    await fs.copyFile(path.join(assetsDir, sourceKey), staged, constants.COPYFILE_EXCL);
    await requireImage(staged, image, signal);
    signal.throwIfAborted();
    try {
      await fs.link(staged, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    await requireImage(target, image, signal);
  } finally {
    await fs.unlink(staged).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export async function* verifiedMigrationImages(assetsDir: string, context: DesktopTaskContext) {
  let entries;
  try {
    entries = await fs.readdir(assetsDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const seen = new Set<string>();
  let completed = 0;
  for (const entry of entries) {
    await context.yieldIfNeeded();
    context.signal.throwIfAborted();
    if (!/^[a-f0-9]{64}\.(?:jpg|jpeg|png|gif|webp)$/.test(entry.name)) continue;
    context.progress({ completed: ++completed, unit: 'files' });
    if (!entry.isFile()) {
      context.logger.info('image_migration_file_skipped', { key: entry.name, reason: 'not_regular_file' });
      continue;
    }
    const image = await inspectImage(path.join(assetsDir, entry.name), context.signal);
    if (!image || image.contentHash !== entry.name.slice(0, 64)) {
      context.logger.info('image_migration_file_skipped', { key: entry.name, reason: 'invalid_bytes_or_hash' });
      continue;
    }
    if (seen.has(image.contentHash)) continue;
    await ensureCanonicalFile(assetsDir, entry.name, image, context.signal);
    seen.add(image.contentHash);
    yield image;
  }
}
