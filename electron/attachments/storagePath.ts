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
  const canonicalPath = path.join(assetsDir, buildAttachmentStorageFileName(attachmentId, originalName));
  const legacyPath = path.join(assetsDir, attachmentId);

  if (canonicalPath === legacyPath) {
    return [canonicalPath];
  }

  return [canonicalPath, legacyPath];
}
