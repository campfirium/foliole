import fs from 'node:fs/promises';
import path from 'node:path';

import type { ImportSourceKind } from '../../lib/core/import/contract.js';
import { resolveLocalImageInboxImportMode, type LocalImageInboxImportMode } from '../import/localImageInboxSource.js';
import { isSameOrNestedPath } from '../libraryPathSafety.js';

export type DirectoryImportAdapterId = 'html_directory' | 'markdown_directory' | 'obsidian_vault' | 'text_directory';

export interface ImportSourceDescriptor {
  adapterId: DirectoryImportAdapterId | 'text_file';
  filePath: string;
  kind: ImportSourceKind;
  sourceName: string;
}

export interface DirectoryImportSourceDescriptor extends ImportSourceDescriptor {
  adapterId: DirectoryImportAdapterId;
  importMode?: LocalImageInboxImportMode;
  mtimeMs: number;
  sizeBytes: number;
}

const HTML_EXTENSIONS = new Set(['.htm', '.html']);
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
const EPUB_EXTENSIONS = new Set(['.epub']);
const PDF_EXTENSIONS = new Set(['.pdf']);
const TEXT_EXTENSIONS = new Set(['.txt']);
const SKIPPED_DIRECTORY_NAMES = new Set(['.git', '.obsidian', 'node_modules']);

export const MANAGED_INBOX_SUPPORTED_KINDS: ImportSourceKind[] = ['epub', 'html', 'markdown', 'pdf', 'text'];

function resolveDirectoryAdapter(
  rootIsObsidianVault: boolean,
  extension: string,
  supportedKinds: ReadonlySet<ImportSourceKind>
): DirectoryImportAdapterId | null {
  if (EPUB_EXTENSIONS.has(extension) && supportedKinds.has('epub')) return 'text_directory';
  if (PDF_EXTENSIONS.has(extension) && supportedKinds.has('pdf')) return 'text_directory';
  if (HTML_EXTENSIONS.has(extension) && supportedKinds.has('html')) return 'html_directory';
  if (MARKDOWN_EXTENSIONS.has(extension) && supportedKinds.has('markdown')) {
    return rootIsObsidianVault ? 'obsidian_vault' : 'markdown_directory';
  }
  if (TEXT_EXTENSIONS.has(extension) && supportedKinds.has('text')) return 'text_directory';
  return null;
}

export function resolveImportKind(filePath: string): ImportSourceKind {
  const extension = path.extname(filePath).toLowerCase();
  if (EPUB_EXTENSIONS.has(extension)) return 'epub';
  if (PDF_EXTENSIONS.has(extension)) return 'pdf';
  if (HTML_EXTENSIONS.has(extension)) return 'html';
  if (TEXT_EXTENSIONS.has(extension)) return 'text';
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown';
  throw new Error(`unsupported import file extension: ${extension || '(none)'}`);
}

async function detectObsidianVaultRoot(rootDir: string) {
  try {
    return (await fs.stat(path.join(rootDir, '.obsidian'))).isDirectory();
  } catch {
    return false;
  }
}

function shouldSkipDirectory(name: string, entryPath: string, excludedPaths: readonly string[]) {
  return SKIPPED_DIRECTORY_NAMES.has(name) || excludedPaths.some((excludedPath) => isSameOrNestedPath(entryPath, excludedPath));
}

async function collectFileSource(args: {
  collected: DirectoryImportSourceDescriptor[];
  includeLocalImages: boolean;
  rootDir: string;
  rootIsObsidianVault: boolean;
  supportedKinds: ReadonlySet<ImportSourceKind>;
}, entryName: string, filePath: string) {
  const adapterId = resolveDirectoryAdapter(args.rootIsObsidianVault, path.extname(entryName).toLowerCase(), args.supportedKinds);
  const stats = await fs.stat(filePath);
  if (!adapterId) {
    const importMode = args.includeLocalImages ? resolveLocalImageInboxImportMode(filePath) : null;
    if (!importMode) return;
    args.collected.push({
      adapterId: 'markdown_directory',
      filePath,
      importMode,
      kind: 'markdown',
      mtimeMs: stats.mtimeMs,
      sizeBytes: stats.size,
      sourceName: path.relative(args.rootDir, filePath)
    });
    return;
  }
  args.collected.push({
    adapterId,
    filePath,
    kind: resolveImportKind(filePath),
    mtimeMs: stats.mtimeMs,
    sizeBytes: stats.size,
    sourceName: path.relative(args.rootDir, filePath)
  });
}

async function collectDirectorySources(args: {
  collected: DirectoryImportSourceDescriptor[];
  currentDir: string;
  excludedPaths: readonly string[];
  includeLocalImages: boolean;
  rootDir: string;
  rootIsObsidianVault: boolean;
  supportedKinds: ReadonlySet<ImportSourceKind>;
}) {
  const entries = await fs.readdir(args.currentDir, { withFileTypes: true });
  const sortedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of sortedEntries) {
    const entryPath = path.join(args.currentDir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name, entryPath, args.excludedPaths)) continue;
      await collectDirectorySources({ ...args, currentDir: entryPath });
      continue;
    }
    if (entry.isFile()) await collectFileSource(args, entry.name, entryPath);
  }
}

export async function discoverDirectoryImportSources(
  rootDir: string,
  options?: { excludedPaths?: string[]; includeLocalImages?: boolean; supportedKinds?: ImportSourceKind[] }
) {
  const collected: DirectoryImportSourceDescriptor[] = [];
  await collectDirectorySources({
    collected,
    currentDir: rootDir,
    excludedPaths: options?.excludedPaths ?? [],
    includeLocalImages: options?.includeLocalImages ?? false,
    rootDir,
    rootIsObsidianVault: await detectObsidianVaultRoot(rootDir),
    supportedKinds: new Set<ImportSourceKind>(options?.supportedKinds ?? ['html', 'markdown'])
  });
  return collected;
}
