import {
  discoverDirectoryImportSources,
  type DirectoryImportSourceDescriptor
} from '../ipc/importSourcePipeline.js';

async function discoverMarkdownSources(directoryPath: string) {
  try {
    return await discoverDirectoryImportSources(directoryPath, { supportedKinds: ['markdown'] });
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return [];
    }
    throw error;
  }
}

export async function discoverReadwiseImportSources(input: {
  highlightDirectoryPath: string;
  primaryDirectoryPath: string;
}): Promise<DirectoryImportSourceDescriptor[]> {
  const [primarySources, highlightSources] = await Promise.all([
    discoverMarkdownSources(input.primaryDirectoryPath),
    discoverMarkdownSources(input.highlightDirectoryPath)
  ]);
  const sourceByName = new Map<string, DirectoryImportSourceDescriptor>();
  for (const source of primarySources) {
    sourceByName.set(source.sourceName, source);
  }
  for (const source of highlightSources) {
    if (!sourceByName.has(source.sourceName)) {
      sourceByName.set(source.sourceName, source);
    }
  }
  return Array.from(sourceByName.values()).sort((left, right) =>
    left.sourceName.localeCompare(right.sourceName)
  );
}
