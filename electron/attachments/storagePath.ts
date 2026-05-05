import path from 'node:path';

export function resolveAttachmentFileExtension(originalName: string | null) {
  if (!originalName) {
    return '';
  }

  return path.extname(originalName);
}

export function buildAttachmentStorageFileName(attachmentId: string, originalName: string | null) {
  return `${attachmentId}${resolveAttachmentFileExtension(originalName)}`;
}

export function resolveAttachmentStoragePathCandidates(
  attachmentId: string,
  originalName: string | null,
  assetsDir: string
) {
  const canonicalPath = resolveAttachmentStoragePath(
    assetsDir,
    buildAttachmentStorageFileName(attachmentId, originalName)
  );
  const legacyPath = resolveAttachmentStoragePath(assetsDir, attachmentId);

  if (canonicalPath === legacyPath) {
    return [canonicalPath];
  }

  return [canonicalPath, legacyPath];
}

function resolveAttachmentStoragePath(assetsDir: string, fileName: string) {
  const resolvedAssetsDir = path.resolve(assetsDir);
  const resolvedPath = path.resolve(resolvedAssetsDir, fileName);
  const relativePath = path.relative(resolvedAssetsDir, resolvedPath);

  if (relativePath.length === 0 || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('attachment storage path escapes assets directory');
  }

  return resolvedPath;
}
