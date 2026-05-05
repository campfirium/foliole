import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { NativeMirrorAttachmentLinkRebuildResult } from '../../lib/platform/nativeUtilityContract.js';
import { loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import { rewriteMirrorMarkdownAttachmentPaths } from './markdownAttachmentPaths.js';

const MARKDOWN_LINK_PATTERN = /(!?\[[^\]\n]*\]\()([^)\n]+)(\))/g;

function isMarkdownDocument(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return extension === '.md' || extension === '.markdown';
}

async function collectMarkdownFiles(rootPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    const markdownFiles = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(rootPath, entry.name);
        if (entry.isDirectory()) {
          return collectMarkdownFiles(entryPath);
        }
        return isMarkdownDocument(entryPath) ? [entryPath] : [];
      })
    );
    return markdownFiles.flat();
  } catch {
    return [];
  }
}

async function collectCurrentAssetBasenames(assetsDir: string) {
  try {
    const entries = await fs.readdir(assetsDir, { withFileTypes: true });
    return new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  } catch {
    return new Set<string>();
  }
}

function unwrapMarkdownDestination(destination: string) {
  const trimmed = destination.trim();
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return { hasAngleBrackets: true, value: trimmed.slice(1, -1) };
  }
  return { hasAngleBrackets: false, value: trimmed };
}

function isAbsolutePathLike(destination: string) {
  return destination.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(destination);
}

function normalizeFileLikePath(destination: string) {
  if (destination.startsWith('file://')) {
    try {
      return decodeURIComponent(new URL(destination).pathname);
    } catch {
      return destination.replace(/^file:\/\/\/?/i, '/');
    }
  }
  return destination;
}

function extractBasename(destination: string) {
  const normalized = normalizeFileLikePath(destination).split(/[?#]/, 1)[0]?.replace(/\\/g, '/') ?? '';
  const basename = normalized.split('/').pop() ?? '';
  return basename.trim();
}

function formatMarkdownDestination(rawDestination: string, nextPath: string) {
  const wrapped = unwrapMarkdownDestination(rawDestination);
  const formattedPath = wrapped.value.startsWith('file://') ? pathToFileURL(nextPath).href : nextPath;
  return wrapped.hasAngleBrackets ? `<${formattedPath}>` : formattedPath;
}

function resolveCurrentAttachmentPath(destination: string, assetBasenames: Set<string>, assetsDir: string) {
  const directRewrite = rewriteMirrorMarkdownAttachmentPaths(`[](${destination})`);
  if (directRewrite !== `[](${destination})`) {
    return directRewrite.slice(3, -1);
  }

  if (!destination.startsWith('file://') && !isAbsolutePathLike(destination)) {
    return null;
  }

  const basename = extractBasename(destination);
  if (!basename || !assetBasenames.has(basename)) {
    return null;
  }
  return path.join(assetsDir, basename);
}

function rebuildDocumentContent(content: string, assetBasenames: Set<string>, assetsDir: string) {
  let rewrittenLinkCount = 0;
  const nextContent = content.replace(MARKDOWN_LINK_PATTERN, (match, prefix, rawDestination, suffix) => {
    const wrapped = unwrapMarkdownDestination(rawDestination);
    const nextPath = resolveCurrentAttachmentPath(wrapped.value, assetBasenames, assetsDir);
    if (!nextPath) {
      return match;
    }
    const nextDestination = formatMarkdownDestination(rawDestination, nextPath);
    if (nextDestination === rawDestination.trim()) {
      return match;
    }
    rewrittenLinkCount += 1;
    return `${prefix}${nextDestination}${suffix}`;
  });

  return {
    rewrittenLinkCount,
    nextContent
  };
}

export async function rebuildMirrorAttachmentLinks(): Promise<NativeMirrorAttachmentLinkRebuildResult> {
  const paths = loadLibraryPathSettingsSync();
  const mirrorDocuments = await collectMarkdownFiles(paths.mirror);
  const assetBasenames = await collectCurrentAssetBasenames(paths.assets_dir);

  let rewrittenDocumentCount = 0;
  let rewrittenLinkCount = 0;

  for (const documentPath of mirrorDocuments) {
    const content = await fs.readFile(documentPath, 'utf8');
    const rebuilt = rebuildDocumentContent(content, assetBasenames, paths.assets_dir);
    if (rebuilt.rewrittenLinkCount === 0) {
      continue;
    }
    await fs.writeFile(documentPath, rebuilt.nextContent, 'utf8');
    rewrittenDocumentCount += 1;
    rewrittenLinkCount += rebuilt.rewrittenLinkCount;
  }

  return {
    scanned_document_count: mirrorDocuments.length,
    rewritten_document_count: rewrittenDocumentCount,
    rewritten_link_count: rewrittenLinkCount,
    updated_at: new Date().toISOString()
  };
}
