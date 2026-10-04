import path from 'node:path';

function isWithinFolder(filePath: string, folderPath: string) {
  const relative = path.relative(folderPath, filePath);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function resolveExternalSearchFolder<T extends { folder_path: string }>(
  documentAbsolutePath: string,
  folders: T[]
): T | null {
  if (!documentAbsolutePath.trim()) return null;
  return folders
    .filter((folder) => folder.folder_path.trim() && isWithinFolder(documentAbsolutePath, folder.folder_path))
    .sort((left, right) => path.resolve(right.folder_path).length - path.resolve(left.folder_path).length)[0] ?? null;
}
