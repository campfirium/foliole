import { createHash } from 'node:crypto';

import {
  IMPORT_PROVIDER_DESKTOP_TEXT_FILE,
  type ImportHighlightPolicy,
  type ImportSourceTrackingMode,
  type ImportSourceKind,
  type PreparedImportRecord,
  type PreparedImportSourceProfile
} from './contract.js';
import {
  applyControlledImportContext,
  type ImportContextPolicy,
  type ImportSidecarHighlight,
  type ImportSourceProfile
} from './controlledContext.js';
import { degradeUnmanagedEpubImages } from './epubEmbeddedResources.js';
import { applyImportHighlightPolicy } from './highlightPolicy.js';
import {
  resolveImportedNodeTitle,
  shouldHideImportedTitleHeading,
  type ImportNodeTitleStrategy
} from './importedNodeTitle.js';
import { normalizeImportedMarkdownHeadings } from './normalizeImportedHeadings.js';

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
  managedEpubImageDestinations?: string[];
  sourceIdentity?: string;
  sourceLocator?: string;
  sourceProfile?: ImportSourceProfile;
  sourceTrackingMode?: ImportSourceTrackingMode;
  titleStrategy?: ImportNodeTitleStrategy;
}

function hashFingerprint(...parts: string[]) {
  return createHash('sha256').update(parts.join('\u001F'), 'utf8').digest('hex');
}

function resolveSourceFingerprint(input: Pick<CreatePreparedDesktopTextImportInput, 'filePath' | 'importedAt' | 'sourceIdentity' | 'sourceTrackingMode'>) {
  if (input.sourceTrackingMode === 'untracked') {
    return hashFingerprint('source', IMPORT_PROVIDER_DESKTOP_TEXT_FILE, 'untracked', input.sourceIdentity ?? input.filePath, input.importedAt);
  }
  return hashFingerprint('source', IMPORT_PROVIDER_DESKTOP_TEXT_FILE, input.sourceIdentity ?? input.filePath);
}

function normalizeImportedContent(content: string) {
  return content.replace(/\r\n?/g, '\n');
}

function appendDegradedReason(...reasons: Array<string | null | undefined>) {
  const collected = reasons
    .map((reason) => reason?.trim())
    .filter((reason): reason is string => Boolean(reason));
  return collected.length > 0 ? Array.from(new Set(collected)).join('; ') : null;
}

function serializeHighlightSidecar(highlightSidecar: ImportSidecarHighlight[] | undefined) {
  if (!highlightSidecar || highlightSidecar.length === 0) {
    return '';
  }
  return highlightSidecar
    .map((highlight) => {
      const text = normalizeImportedContent(highlight.text).trim();
      const label = normalizeImportedContent(highlight.label ?? '').trim();
      return `${label}\u001e${text}`;
    })
    .join('\u001d');
}

function mergeNormalizedImportedBodyContent(input: {
  originalContent: string;
  normalizedBodyContent: string;
  finalContent: string;
}) {
  if (input.finalContent === input.originalContent) {
    return input.normalizedBodyContent;
  }

  const bodyPrefix = `${input.originalContent}\n\n`;
  if (input.finalContent.startsWith(bodyPrefix)) {
    return `${input.normalizedBodyContent}\n\n${input.finalContent.slice(bodyPrefix.length)}`;
  }

  return input.finalContent;
}

function resolvePreparedImportContent(input: CreatePreparedDesktopTextImportInput) {
  const normalizedInputContent = normalizeImportedContent(input.content);
  const epubDegradedContent =
    input.kind === 'epub' || input.sourceProfile === 'epub'
      ? degradeUnmanagedEpubImages(normalizedInputContent, new Set(input.managedEpubImageDestinations ?? []))
      : { content: normalizedInputContent, degradedReason: null };
  const highlightPolicyResult = applyImportHighlightPolicy(
    epubDegradedContent.content,
    input.highlightPolicy ?? 'reference_only'
  );
  const highlightedContent = highlightPolicyResult.content;
  const normalizedBodyContent = normalizeImportedMarkdownHeadings(highlightedContent);
  const contextResult = applyControlledImportContext({
    content: highlightedContent,
    degradedReason: appendDegradedReason(input.degradedReason, epubDegradedContent.degradedReason),
    highlightSidecar: input.highlightSidecar,
    policy: input.contextPolicy,
    sourceKind: input.kind,
    sourceName: input.fileName,
    sourceProfile: input.sourceProfile
  });
  return {
    contextResult,
    highlightedContent,
    highlightPolicyResult,
    normalizedContent: normalizeImportedContent(
      mergeNormalizedImportedBodyContent({
        finalContent: contextResult.content,
        normalizedBodyContent,
        originalContent: highlightedContent
      })
    )
  };
}

function collectPreparedMatchedHighlights(input: {
  contextResult: ReturnType<typeof applyControlledImportContext>;
  highlightPolicyResult: ReturnType<typeof applyImportHighlightPolicy>;
}) {
  return [
    ...input.highlightPolicyResult.highlights,
    ...input.contextResult.matchedHighlights.map(({ excerpt, highlight }) => ({
      content: excerpt,
      label: highlight.label?.trim() || null
    }))
  ];
}

export function createPreparedDesktopTextImport(
  input: CreatePreparedDesktopTextImportInput
): PreparedImportRecord {
  const preparedContent = resolvePreparedImportContent(input);
  return {
    content: preparedContent.normalizedContent,
    contentFingerprint: hashFingerprint(
      'content',
      IMPORT_PROVIDER_DESKTOP_TEXT_FILE,
      input.kind,
      preparedContent.normalizedContent,
      serializeHighlightSidecar(input.highlightSidecar)
    ),
    degradedReason: preparedContent.contextResult.degradedReason,
    importedAt: input.importedAt,
    matchedHighlights: collectPreparedMatchedHighlights(preparedContent),
    hideTitleHeading: shouldHideImportedTitleHeading(preparedContent.highlightedContent),
    nodeTitle: resolveImportedNodeTitle({
      content: preparedContent.highlightedContent,
      sourceName: input.fileName,
      titleStrategy: input.titleStrategy ?? 'file_name'
    }),
    provider: IMPORT_PROVIDER_DESKTOP_TEXT_FILE,
    sourceProfile: (input.sourceProfile ?? 'default') as PreparedImportSourceProfile,
    sourceFingerprint: resolveSourceFingerprint(input),
    sourceKind: input.kind,
    sourceLocator: input.sourceLocator ?? input.filePath,
    sourceName: input.fileName
  };
}
