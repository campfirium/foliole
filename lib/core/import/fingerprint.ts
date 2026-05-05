import { createHash } from 'node:crypto';

import {
  IMPORT_PROVIDER_DESKTOP_TEXT_FILE,
  type ImportHighlightPolicy,
  type ImportSourceKind,
  type PreparedImportRecord
} from './contract.js';
import {
  applyControlledImportContext,
  type ImportContextPolicy,
  type ImportSidecarHighlight,
  type ImportSourceProfile
} from './controlledContext.js';
import { applyImportHighlightPolicy } from './highlightPolicy.js';

interface CreatePreparedDesktopTextImportInput {
  content: string;
  contextPolicy?: ImportContextPolicy;
  degradedReason?: string | null;
  fileName: string;
  filePath: string;
  highlightSidecar?: ImportSidecarHighlight[];
  highlightPolicy?: ImportHighlightPolicy;
  importedAt: string;
  kind: ImportSourceKind;
  sourceProfile?: ImportSourceProfile;
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
  const highlightedContent = applyImportHighlightPolicy(input.content, input.highlightPolicy ?? 'reference_only');
  const contextResult = applyControlledImportContext({
    content: highlightedContent,
    degradedReason: input.degradedReason,
    highlightSidecar: input.highlightSidecar,
    policy: input.contextPolicy,
    sourceKind: input.kind,
    sourceName: input.fileName,
    sourceProfile: input.sourceProfile
  });
  const normalizedContent = normalizeImportedContent(contextResult.content);
  return {
    content: normalizedContent,
    contentFingerprint: hashFingerprint(
      'content',
      IMPORT_PROVIDER_DESKTOP_TEXT_FILE,
      input.kind,
      normalizedContent
    ),
    degradedReason: contextResult.degradedReason,
    importedAt: input.importedAt,
    provider: IMPORT_PROVIDER_DESKTOP_TEXT_FILE,
    sourceFingerprint: hashFingerprint('source', IMPORT_PROVIDER_DESKTOP_TEXT_FILE, input.filePath),
    sourceKind: input.kind,
    sourceLocator: input.filePath,
    sourceName: input.fileName
  };
}
