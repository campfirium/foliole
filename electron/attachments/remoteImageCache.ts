import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

interface RemoteImageCacheMetadata {
  cachedAt: string;
  cacheKey: string;
  lastReadAt: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  sourceUrl: string;
}

export interface RemoteImageCacheEntry {
  bytes: Uint8Array;
  cacheKey: string;
  mimeType: string;
  originalName: string;
  sourceUrl: string;
}

let remoteImageCacheRoot: string | null = null;

function createCacheFileStem(cacheKey: string) {
  return crypto.createHash('sha256').update(cacheKey).digest('hex');
}

function resolveCachePaths(cacheKey: string) {
  if (!remoteImageCacheRoot) {
    return null;
  }
  const stem = createCacheFileStem(cacheKey);
  return {
    bytesPath: path.join(remoteImageCacheRoot, `${stem}.bin`),
    metadataPath: path.join(remoteImageCacheRoot, `${stem}.json`)
  };
}

function isCacheMetadata(value: unknown, cacheKey: string): value is RemoteImageCacheMetadata {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const sizeBytes = candidate.sizeBytes;
  return (
    candidate.cacheKey === cacheKey &&
    typeof candidate.sourceUrl === 'string' &&
    typeof candidate.mimeType === 'string' &&
    candidate.mimeType.startsWith('image/') &&
    typeof candidate.originalName === 'string' &&
    typeof sizeBytes === 'number' &&
    Number.isInteger(sizeBytes) &&
    sizeBytes >= 0
  );
}

async function writeJsonAtomic(filePath: string, value: RemoteImageCacheMetadata) {
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value)}\n`);
  await fs.rename(tempPath, filePath);
}

async function writeBytesAtomic(filePath: string, bytes: Uint8Array) {
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, bytes);
  await fs.rename(tempPath, filePath);
}

async function deleteCacheEntry(cacheKey: string) {
  const paths = resolveCachePaths(cacheKey);
  if (!paths) {
    return;
  }
  await Promise.all([
    fs.rm(paths.bytesPath, { force: true }),
    fs.rm(paths.metadataPath, { force: true })
  ]);
}

export function configureRemoteImageCacheRoot(root: string | null) {
  remoteImageCacheRoot = root?.trim() ? root : null;
}

export function resolveRemoteImageCacheFilePathsForTests(cacheKey: string) {
  return resolveCachePaths(cacheKey);
}

export function resetRemoteImageCacheForTests() {
  remoteImageCacheRoot = null;
}

export async function readRemoteImageCache(cacheKey: string): Promise<RemoteImageCacheEntry | null> {
  const paths = resolveCachePaths(cacheKey);
  if (!paths) {
    return null;
  }
  try {
    const [metadataText, bytes] = await Promise.all([
      fs.readFile(paths.metadataPath, 'utf8'),
      fs.readFile(paths.bytesPath)
    ]);
    const metadata: unknown = JSON.parse(metadataText);
    if (!isCacheMetadata(metadata, cacheKey) || metadata.sizeBytes !== bytes.byteLength) {
      await deleteCacheEntry(cacheKey);
      return null;
    }
    void writeJsonAtomic(paths.metadataPath, {
      ...metadata,
      lastReadAt: new Date().toISOString()
    }).catch(() => undefined);
    return {
      bytes: new Uint8Array(bytes),
      cacheKey,
      mimeType: metadata.mimeType,
      originalName: metadata.originalName,
      sourceUrl: metadata.sourceUrl
    };
  } catch {
    return null;
  }
}

export async function writeRemoteImageCache(entry: RemoteImageCacheEntry) {
  const paths = resolveCachePaths(entry.cacheKey);
  if (!paths) {
    return;
  }
  try {
    await fs.mkdir(path.dirname(paths.bytesPath), { recursive: true });
    await writeBytesAtomic(paths.bytesPath, entry.bytes);
    const now = new Date().toISOString();
    await writeJsonAtomic(paths.metadataPath, {
      cachedAt: now,
      cacheKey: entry.cacheKey,
      lastReadAt: now,
      mimeType: entry.mimeType,
      originalName: entry.originalName,
      sizeBytes: entry.bytes.byteLength,
      sourceUrl: entry.sourceUrl
    });
  } catch {
    // Rendering has the downloaded bytes already; a cache write failure must not hide the image.
  }
}
