import { promises as fs } from 'node:fs';
import path from 'node:path';

function toRelativeKey(rootPath: string, targetPath: string) {
  return path.relative(rootPath, targetPath).split(path.sep).join('/');
}

function isInsideRoot(rootPath: string, targetPath: string) {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function buildMirrorKeepSets(mirrorRoot: string, targetPaths: string[]) {
  const rootPath = path.resolve(mirrorRoot);
  const files = new Set<string>();
  const directories = new Set<string>(['']);
  for (const targetPath of targetPaths) {
    const absolutePath = path.resolve(targetPath);
    if (!isInsideRoot(rootPath, absolutePath)) {
      continue;
    }
    const fileKey = toRelativeKey(rootPath, absolutePath);
    files.add(fileKey);
    let currentDirectory = path.dirname(fileKey);
    while (currentDirectory && currentDirectory !== '.') {
      directories.add(currentDirectory.split(path.sep).join('/'));
      currentDirectory = path.dirname(currentDirectory);
    }
  }
  return { directories, files, rootPath };
}

async function removeMirrorEntry(rootPath: string, entryPath: string, recursive: boolean) {
  const absolutePath = path.resolve(entryPath);
  if (!isInsideRoot(rootPath, absolutePath) || absolutePath === rootPath) {
    return;
  }
  await fs.rm(absolutePath, { force: true, recursive });
}

async function pruneDirectory(rootPath: string, directoryPath: string, keep: ReturnType<typeof buildMirrorKeepSets>) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    const relativeKey = toRelativeKey(rootPath, entryPath);
    if (entry.isDirectory()) {
      if (keep.directories.has(relativeKey)) {
        await pruneDirectory(rootPath, entryPath, keep);
      } else {
        await removeMirrorEntry(rootPath, entryPath, true);
      }
    } else if (!keep.files.has(relativeKey)) {
      await removeMirrorEntry(rootPath, entryPath, false);
    }
  }
}

export async function pruneMirrorOutputToTargets(mirrorRoot: string, targetPaths: string[]) {
  await fs.mkdir(mirrorRoot, { recursive: true });
  const keep = buildMirrorKeepSets(mirrorRoot, targetPaths);
  await pruneDirectory(keep.rootPath, keep.rootPath, keep);
}
