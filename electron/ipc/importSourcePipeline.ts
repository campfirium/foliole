import fs from 'node:fs/promises';
import path from 'node:path';

import type { ImportHighlightPolicy, ImportSourceKind, PreparedImportRecord } from '../../lib/core/import/contract.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import {
  convertHtmlToMarkdownCompatible,
  formatHtmlConversionDegradedReason
} from '../../lib/core/import/htmlToMarkdownCompatible.js';
import type { NativeTextImportArgs } from '../../lib/platform/nativeContract.js';

export type DirectoryImportAdapterId = 'html_directory' | 'markdown_directory' | 'obsidian_vault';

export interface ImportSourceDescriptor {
  adapterId: DirectoryImportAdapterId | 'text_file';
  filePath: string;
  kind: ImportSourceKind;
  sourceName: string;
}

export interface DirectoryImportSourceDescriptor extends ImportSourceDescriptor {
  adapterId: DirectoryImportAdapterId;
  mtimeMs: number;
  sizeBytes: number;
}

const HTML_EXTENSIONS = new Set(['.htm', '.html']);
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
const TEXT_EXTENSIONS = new Set(['.txt']);
const SKIPPED_DIRECTORY_NAMES = new Set(['.git', '.obsidian', 'node_modules']);

function stripUtf8Bom(content: string) {
  return content.startsWith('\uFEFF') ? content.slice(1) : content;
}

function resolveDirectoryAdapter(rootIsObsidianVault: boolean, extension: string): DirectoryImportAdapterId | null {
  if (HTML_EXTENSIONS.has(extension)) {
    return 'html_directory';
  }
  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return rootIsObsidianVault ? 'obsidian_vault' : 'markdown_directory';
  }
  return null;
}

export function resolveImportKind(filePath: string): ImportSourceKind {
  const extension = path.extname(filePath).toLowerCase();
  if (HTML_EXTENSIONS.has(extension)) {
    return 'html';
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return 'text';
  }
  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return 'markdown';
  }
  throw new Error(`unsupported import file extension: ${extension || '(none)'}`);
}

export function resolveImportHighlightPolicy(args?: Pick<NativeTextImportArgs, 'highlight_policy'>): ImportHighlightPolicy {
  return args?.highlight_policy === 'adopt' ? 'adopt' : 'reference_only';
}

export function toImportPayload(content: string, kind: ImportSourceKind) {
  const normalizedContent = stripUtf8Bom(content);
  if (kind !== 'html') {
    return { content: normalizedContent, degradedReason: null };
  }
  const converted = convertHtmlToMarkdownCompatible(normalizedContent);
  return {
    content: converted.content,
    degradedReason: formatHtmlConversionDegradedReason(converted.warnings)
  };
}

export function buildPreparedImportRecord(
  source: Pick<ImportSourceDescriptor, 'filePath' | 'kind' | 'sourceName'>,
  input: {
    content: string;
    degradedReason?: string | null;
    highlightPolicy?: ImportHighlightPolicy;
    importedAt: string;
  }
): PreparedImportRecord {
  return createPreparedDesktopTextImport({
    content: input.content,
    degradedReason: input.degradedReason,
    fileName: source.sourceName,
    filePath: source.filePath,
    highlightPolicy: input.highlightPolicy,
    importedAt: input.importedAt,
    kind: source.kind
  });
}

export async function loadPreparedImportRecord(
  source: Pick<ImportSourceDescriptor, 'filePath' | 'kind' | 'sourceName'>,
  options: {
    highlightPolicy?: ImportHighlightPolicy;
    importedAt: string;
  }
) {
  const payload = toImportPayload(await fs.readFile(source.filePath, 'utf8'), source.kind);
  return buildPreparedImportRecord(source, { ...payload, ...options });
}

export function resolveSingleFileImportSource(filePath: string): ImportSourceDescriptor {
  return {
    adapterId: 'text_file',
    filePath,
    kind: resolveImportKind(filePath),
    sourceName: path.basename(filePath)
  };
}

async function detectObsidianVaultRoot(rootDir: string) {
  try {
    return (await fs.stat(path.join(rootDir, '.obsidian'))).isDirectory();
  } catch {
    return false;
  }
}

async function collectDirectorySources(
  rootDir: string,
  currentDir: string,
  rootIsObsidianVault: boolean,
  collected: DirectoryImportSourceDescriptor[]
) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const sortedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of sortedEntries) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }
      await collectDirectorySources(rootDir, path.join(currentDir, entry.name), rootIsObsidianVault, collected);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const filePath = path.join(currentDir, entry.name);
    const adapterId = resolveDirectoryAdapter(rootIsObsidianVault, path.extname(entry.name).toLowerCase());
    if (!adapterId) {
      continue;
    }
    const stats = await fs.stat(filePath);
    collected.push({
      adapterId,
      filePath,
      kind: resolveImportKind(filePath),
      mtimeMs: stats.mtimeMs,
      sizeBytes: stats.size,
      sourceName: path.relative(rootDir, filePath)
    });
  }
}

export async function discoverDirectoryImportSources(rootDir: string) {
  const collected: DirectoryImportSourceDescriptor[] = [];
  await collectDirectorySources(rootDir, rootDir, await detectObsidianVaultRoot(rootDir), collected);
  return collected;
}
