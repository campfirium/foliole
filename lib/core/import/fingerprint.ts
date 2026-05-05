import { createHash } from 'node:crypto';

import {
  IMPORT_PROVIDER_DESKTOP_TEXT_FILE,
  type ImportSourceKind,
  type PreparedImportRecord
} from './contract.js';

interface CreatePreparedDesktopTextImportInput {
  content: string;
  degradedReason?: string | null;
  fileName: string;
  filePath: string;
  importedAt: string;
  kind: ImportSourceKind;
}

function hashFingerprint(...parts: string[]) {
  return createHash('sha256').update(parts.join('\u001F'), 'utf8').digest('hex');
}

function normalizeImportedContent(content: string) {
  return content.replace(/\r\n?/g, '\n');
}

export function createPreparedDesktopTextImport(
  input: CreatePreparedDesktopTextImportInput
): PreparedImportRecord {
  const normalizedContent = normalizeImportedContent(input.content);
  return {
    content: normalizedContent,
    contentFingerprint: hashFingerprint(
      'content',
      IMPORT_PROVIDER_DESKTOP_TEXT_FILE,
      input.kind,
      normalizedContent
    ),
    degradedReason: input.degradedReason ?? null,
    importedAt: input.importedAt,
    provider: IMPORT_PROVIDER_DESKTOP_TEXT_FILE,
    sourceFingerprint: hashFingerprint('source', IMPORT_PROVIDER_DESKTOP_TEXT_FILE, input.filePath),
    sourceKind: input.kind,
    sourceLocator: input.filePath,
    sourceName: input.fileName
  };
}
