import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  ImportHighlightPolicy,
  ImportSourceKind,
  ImportSourceTrackingMode,
  PreparedImportRecord
} from '../../lib/core/import/contract.js';
import {
  buildRetainedDegradedImportContent,
  type ImportContextPolicy,
  type ImportSidecarHighlight,
  type ImportSourceProfile
} from '../../lib/core/import/controlledContext.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import {
  convertHtmlToMarkdownCompatible,
  formatHtmlConversionDegradedReason
} from '../../lib/core/import/htmlToMarkdownCompatible.js';
import { normalizeImportNodeTitleStrategy, type ImportNodeTitleStrategy } from '../../lib/core/import/importManagerSettings.js';
import type { NativeTextImportArgs } from '../../lib/platform/nativeContract.js';

export type DirectoryImportAdapterId = 'html_directory' | 'markdown_directory' | 'obsidian_vault' | 'text_directory';

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
const EPUB_EXTENSIONS = new Set(['.epub']);
const TEXT_EXTENSIONS = new Set(['.txt']);
const SKIPPED_DIRECTORY_NAMES = new Set(['.git', '.obsidian', 'node_modules']);

export const MANAGED_INBOX_SUPPORTED_KINDS: ImportSourceKind[] = ['epub', 'markdown', 'text'];

function stripUtf8Bom(content: string) {
  return content.startsWith('\uFEFF') ? content.slice(1) : content;
}

function resolveDirectoryAdapter(
  rootIsObsidianVault: boolean,
  extension: string,
  supportedKinds: ReadonlySet<ImportSourceKind>
): DirectoryImportAdapterId | null {
  if (EPUB_EXTENSIONS.has(extension) && supportedKinds.has('epub')) {
    return 'text_directory';
  }
  if (HTML_EXTENSIONS.has(extension) && supportedKinds.has('html')) {
    return 'html_directory';
  }
  if (MARKDOWN_EXTENSIONS.has(extension) && supportedKinds.has('markdown')) {
    return rootIsObsidianVault ? 'obsidian_vault' : 'markdown_directory';
  }
  if (TEXT_EXTENSIONS.has(extension) && supportedKinds.has('text')) {
    return 'text_directory';
  }
  return null;
}

export function resolveImportKind(filePath: string): ImportSourceKind {
  const extension = path.extname(filePath).toLowerCase();
  if (EPUB_EXTENSIONS.has(extension)) {
    return 'epub';
  }
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

export function resolveImportNodeTitleStrategy(args?: Pick<NativeTextImportArgs, 'title_strategy'>): ImportNodeTitleStrategy {
  return normalizeImportNodeTitleStrategy(args?.title_strategy);
}

export function toImportPayload(content: string, kind: ImportSourceKind, sourceName = 'Imported source') {
  const normalizedContent = stripUtf8Bom(content);
  if (kind === 'epub') {
    const reason = 'EPUB import degraded: text extraction is not implemented yet';
    return {
      content: buildRetainedDegradedImportContent({ reason, sourceKind: kind, sourceName }),
      degradedReason: reason
    };
  }
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
    contextPolicy?: ImportContextPolicy;
    degradedReason?: string | null;
    highlightSidecar?: ImportSidecarHighlight[];
    highlightPolicy?: ImportHighlightPolicy;
    importedAt: string;
    sourceIdentity?: string;
    sourceLocator?: string;
    sourceProfile?: ImportSourceProfile;
    sourceTrackingMode?: ImportSourceTrackingMode;
    titleStrategy?: ImportNodeTitleStrategy;
  }
): PreparedImportRecord {
  return createPreparedDesktopTextImport({
    content: input.content,
    contextPolicy: input.contextPolicy,
    degradedReason: input.degradedReason,
    fileName: source.sourceName,
    filePath: source.filePath,
    highlightSidecar: input.highlightSidecar,
    highlightPolicy: input.highlightPolicy,
    importedAt: input.importedAt,
    kind: source.kind,
    sourceIdentity: input.sourceIdentity,
    sourceLocator: input.sourceLocator,
    sourceProfile: input.sourceProfile,
    sourceTrackingMode: input.sourceTrackingMode,
    titleStrategy: input.titleStrategy
  });
}

export async function loadPreparedImportRecord(
  source: Pick<ImportSourceDescriptor, 'filePath' | 'kind' | 'sourceName'>,
  options: {
    contextPolicy?: ImportContextPolicy;
    highlightSidecar?: ImportSidecarHighlight[];
    highlightPolicy?: ImportHighlightPolicy;
    importedAt: string;
    sourceProfile?: ImportSourceProfile;
    sourceTrackingMode?: ImportSourceTrackingMode;
    titleStrategy?: ImportNodeTitleStrategy;
  }
) {
  const payload =
    source.kind === 'epub'
      ? toImportPayload('', source.kind, source.sourceName)
      : toImportPayload(await fs.readFile(source.filePath, 'utf8'), source.kind, source.sourceName);
  return buildPreparedImportRecord(source, {
    ...payload,
    ...options,
    sourceProfile: options.sourceProfile ?? (source.kind === 'epub' ? 'epub' : undefined)
  });
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
  collected: DirectoryImportSourceDescriptor[],
  supportedKinds: ReadonlySet<ImportSourceKind>
) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const sortedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of sortedEntries) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }
      await collectDirectorySources(rootDir, path.join(currentDir, entry.name), rootIsObsidianVault, collected, supportedKinds);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const filePath = path.join(currentDir, entry.name);
    const adapterId = resolveDirectoryAdapter(rootIsObsidianVault, path.extname(entry.name).toLowerCase(), supportedKinds);
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

export async function discoverDirectoryImportSources(
  rootDir: string,
  options?: { supportedKinds?: ImportSourceKind[] }
) {
  const collected: DirectoryImportSourceDescriptor[] = [];
  const supportedKinds = new Set<ImportSourceKind>(options?.supportedKinds ?? ['html', 'markdown']);
  await collectDirectorySources(rootDir, rootDir, await detectObsidianVaultRoot(rootDir), collected, supportedKinds);
  return collected;
}
