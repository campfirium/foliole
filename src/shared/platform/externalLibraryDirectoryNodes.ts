import type {
  ExternalLibraryBrowseEntry,
  ExternalLibraryDirectoryNode,
  ExternalLibraryFolder
} from './externalLibraryBrowseModel';

interface DirectoryPathRecord {
  childPaths: string[];
  directDocumentCount: number;
}

interface DirectoryNodeBuilders {
  compareNaturalName: (left: string, right: string) => number;
  normalizeDirectoryPath: (pathValue: string) => string;
  resolveEntryDirectoryPath: (relativePath: string) => string;
  resolveFolderDisplayLabel: (folder: Pick<ExternalLibraryFolder, 'folderPath' | 'id'>) => string;
}

export function buildExternalLibraryDirectoryNodes(
  folder: ExternalLibraryFolder,
  entries: ExternalLibraryBrowseEntry[],
  builders: DirectoryNodeBuilders
) {
  const records = collectDirectoryRecords(entries, builders);
  const visiblePaths = collectCompactDirectoryPaths(records, builders);
  const visiblePathSet = new Set(visiblePaths);
  const nodes = visiblePaths.map((directoryPath) =>
    buildDirectoryNode(folder, directoryPath, entries, resolveVisibleParentDirectoryPath(directoryPath, visiblePathSet), builders)
  );
  return nodes.map((node) => ({
    ...node,
    hasChildren: nodes.some((candidate) => candidate.parentDirectoryPath === node.directoryPath)
  }));
}

function collectDirectoryRecords(entries: ExternalLibraryBrowseEntry[], builders: DirectoryNodeBuilders) {
  const records = new Map<string, DirectoryPathRecord>();
  const ensureRecord = (path: string) => {
    const current = records.get(path);
    if (current) return current;
    const next = { childPaths: [], directDocumentCount: 0 };
    records.set(path, next);
    return next;
  };
  entries.forEach((entry) => {
    const segments = builders.resolveEntryDirectoryPath(entry.relativePath).split('/').filter(Boolean);
    let currentPath = '';
    segments.forEach((segment) => {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      ensureRecord(currentPath);
      if (!parentPath) return;
      const parentRecord = ensureRecord(parentPath);
      if (!parentRecord.childPaths.includes(currentPath)) parentRecord.childPaths.push(currentPath);
    });
    if (currentPath) ensureRecord(currentPath).directDocumentCount += 1;
  });
  return records;
}

function collectCompactDirectoryPaths(records: Map<string, DirectoryPathRecord>, builders: DirectoryNodeBuilders) {
  const childPaths = new Set([...records.values()].flatMap((record) => record.childPaths));
  return [...records.keys()]
    .filter((path) => !childPaths.has(path))
    .flatMap((path) => collectCompactDirectoryPathsFrom(records, path))
    .sort((left, right) => compareDirectoryPath(left, right, builders));
}

function collectCompactDirectoryPathsFrom(records: Map<string, DirectoryPathRecord>, startPath: string): string[] {
  const compactPath = resolveCompactDirectoryPath(records, startPath);
  const childPaths = records.get(compactPath)?.childPaths ?? [];
  return [compactPath, ...childPaths.flatMap((childPath) => collectCompactDirectoryPathsFrom(records, childPath))];
}

function resolveCompactDirectoryPath(records: Map<string, DirectoryPathRecord>, startPath: string) {
  let currentPath = startPath;
  while (true) {
    const record = records.get(currentPath);
    if (!record || record.directDocumentCount > 0 || record.childPaths.length !== 1) return currentPath;
    currentPath = record.childPaths[0] ?? currentPath;
  }
}

function compareDirectoryPath(left: string, right: string, builders: DirectoryNodeBuilders) {
  const leftSegments = builders.normalizeDirectoryPath(left).split('/').filter(Boolean);
  const rightSegments = builders.normalizeDirectoryPath(right).split('/').filter(Boolean);
  const length = Math.min(leftSegments.length, rightSegments.length);
  for (let index = 0; index < length; index += 1) {
    const result = builders.compareNaturalName(leftSegments[index] ?? '', rightSegments[index] ?? '');
    if (result !== 0) return result;
  }
  return leftSegments.length - rightSegments.length;
}

function buildDirectoryNode(
  folder: ExternalLibraryFolder,
  directoryPath: string,
  entries: ExternalLibraryBrowseEntry[],
  visibleParentDirectoryPath: string | null,
  builders: DirectoryNodeBuilders
) {
  const normalizedDirectoryPath = builders.normalizeDirectoryPath(directoryPath);
  const documentCount = entries.filter((entry) => {
    const entryDirectoryPath = builders.resolveEntryDirectoryPath(entry.relativePath);
    return entryDirectoryPath === normalizedDirectoryPath || entryDirectoryPath.startsWith(`${normalizedDirectoryPath}/`);
  }).length;
  return {
    directoryPath: normalizedDirectoryPath,
    documentCount,
    folderId: folder.id,
    hasChildren: false,
    name: resolveDirectoryNodeName(normalizedDirectoryPath, visibleParentDirectoryPath, folder, builders),
    parentDirectoryPath: visibleParentDirectoryPath
  } satisfies ExternalLibraryDirectoryNode;
}

function resolveDirectoryNodeName(
  directoryPath: string,
  visibleParentDirectoryPath: string | null,
  folder: ExternalLibraryFolder,
  builders: DirectoryNodeBuilders
) {
  const prefix = visibleParentDirectoryPath ? `${visibleParentDirectoryPath}/` : '';
  const compactName = directoryPath.startsWith(prefix) ? directoryPath.slice(prefix.length) : directoryPath;
  return compactName
    ? compactName.split('/').filter(Boolean).map(formatDirectoryDisplaySegment).join(' › ')
    : builders.resolveFolderDisplayLabel(folder);
}

function formatDirectoryDisplaySegment(segment: string) {
  return /^[A-Za-z]:$/.test(segment) ? segment.slice(0, -1) : segment;
}

function resolveVisibleParentDirectoryPath(directoryPath: string, visiblePathSet: Set<string>) {
  let parentPath = directoryPath.includes('/') ? directoryPath.slice(0, directoryPath.lastIndexOf('/')) : '';
  while (parentPath) {
    if (visiblePathSet.has(parentPath)) return parentPath;
    parentPath = parentPath.includes('/') ? parentPath.slice(0, parentPath.lastIndexOf('/')) : '';
  }
  return null;
}
