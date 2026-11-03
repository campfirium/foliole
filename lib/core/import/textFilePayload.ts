import type { ImportSourceKind } from './contract.js';
import { decodeHtmlFile } from './decodeHtmlFile.js';
import { decodeTextFile } from './decodeTextFile.js';
import { convertHtmlToMarkdownCompatible, formatHtmlConversionDegradedReason } from './htmlToMarkdownCompatible.js';

export type TextFileImportKind = Extract<ImportSourceKind, 'text' | 'markdown' | 'html'>;

export function toTextFileImportPayload(content: string, kind: TextFileImportKind) {
  const normalized = content.replace(/^\uFEFF/u, '');
  if (kind !== 'html') return { content: normalized, degradedReason: null };
  const converted = convertHtmlToMarkdownCompatible(normalized);
  return { content: converted.content, degradedReason: formatHtmlConversionDegradedReason(converted.warnings) };
}

export function readTextFileImportPayload(bytes: Uint8Array, kind: TextFileImportKind) {
  // Markdown uses the desktop UTF-8 reader; TXT and HTML keep their stricter encoding rules.
  const content = kind === 'html' ? decodeHtmlFile(bytes)
    : kind === 'text' ? decodeTextFile(bytes) : new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  return toTextFileImportPayload(content, kind);
}
