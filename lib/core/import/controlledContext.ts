import type { ImportSourceKind } from './contract.js';
import { createContextExcerptLocator } from './controlledContextMatch.js';
import { findPreparedHighlightExcerptInLocator, prepareHighlightExcerptCandidate } from './highlightExcerptMatch.js';

export type ImportContextPolicy = 'full_text' | 'full_text_with_context' | 'context_only';
export type ImportSourceProfile = 'default' | 'epub' | 'body_with_highlight_sidecar';

export interface ImportSidecarHighlight {
  note?: string | null;
  text: string;
  label?: string;
}

export interface ControlledImportContextInput {
  content: string;
  degradedReason?: string | null;
  highlightSidecar?: ImportSidecarHighlight[];
  policy?: ImportContextPolicy;
  sourceKind: ImportSourceKind;
  sourceName: string;
  sourceProfile?: ImportSourceProfile;
}

interface ControlledImportContextOutput {
  content: string;
  degradedReason: string | null;
  matchedHighlights: Array<{ excerpt: string; highlight: ImportSidecarHighlight }>;
  policy: ImportContextPolicy;
  unmatchedHighlights: ImportSidecarHighlight[];
}

function appendDegradedReason(...reasons: Array<string | null | undefined>) {
  const collected = reasons
    .map((reason) => reason?.trim())
    .filter((reason): reason is string => Boolean(reason));
  return collected.length > 0 ? Array.from(new Set(collected)).join('; ') : null;
}

export function buildRetainedDegradedImportContent(input: {
  reason: string;
  sourceKind: ImportSourceKind;
  sourceName: string;
}) {
  return [`# ${input.sourceName}`, '[Degraded import retained]', `- source kind: ${input.sourceKind}`, `- reason: ${input.reason}`].join(
    '\n'
  );
}

export function resolveImportContextPolicy(input: Pick<ControlledImportContextInput, 'highlightSidecar' | 'policy' | 'sourceProfile'>) {
  if (input.policy) {
    return input.policy;
  }
  if (input.sourceProfile === 'epub' || (input.highlightSidecar?.length ?? 0) > 0) {
    return 'full_text_with_context';
  }
  return 'full_text';
}

function splitMatchedHighlights(input: ControlledImportContextInput) {
  const matchedHighlights: Array<{ excerpt: string; highlight: ImportSidecarHighlight }> = [];
  const unmatchedHighlights: ImportSidecarHighlight[] = [];
  const locator = createContextExcerptLocator(input.content);
  input.highlightSidecar?.forEach((highlight) => {
    const prepared = prepareHighlightExcerptCandidate(highlight);
    const excerpt = findPreparedHighlightExcerptInLocator(locator, prepared);
    if (excerpt) {
      matchedHighlights.push({ excerpt, highlight });
      return;
    }
    unmatchedHighlights.push(highlight);
  });
  return { matchedHighlights, unmatchedHighlights };
}

function resolveControlledContent(input: {
  content: string;
  degradedReason: string | null;
  matchedHighlights: Array<{ excerpt: string; highlight: ImportSidecarHighlight }>;
  policy: ImportContextPolicy;
  sourceKind: ImportSourceKind;
  sourceName: string;
  unmatchedHighlights: ImportSidecarHighlight[];
}) {
  if (input.policy === 'full_text') {
    return {
      content: input.content,
      degradedReason: input.degradedReason,
      matchedHighlights: input.matchedHighlights,
      policy: input.policy,
      unmatchedHighlights: input.unmatchedHighlights
    };
  }

  if (input.matchedHighlights.length > 0) {
    return {
      content: input.content,
      degradedReason: input.degradedReason,
      matchedHighlights: input.matchedHighlights,
      policy: input.policy,
      unmatchedHighlights: input.unmatchedHighlights
    };
  }

  if (input.unmatchedHighlights.length > 0) {
    return {
      content: input.content,
      degradedReason: input.degradedReason,
      matchedHighlights: input.matchedHighlights,
      policy: input.policy,
      unmatchedHighlights: input.unmatchedHighlights
    };
  }

  return {
    content: buildRetainedDegradedImportContent({
      reason: input.degradedReason ?? 'Controlled context unavailable',
      sourceKind: input.sourceKind,
      sourceName: input.sourceName
    }),
    degradedReason: input.degradedReason,
    matchedHighlights: input.matchedHighlights,
    policy: input.policy,
    unmatchedHighlights: input.unmatchedHighlights
  };
}

export function applyControlledImportContext(input: ControlledImportContextInput): ControlledImportContextOutput {
  const policy = resolveImportContextPolicy(input);
  if ((input.highlightSidecar?.length ?? 0) === 0) {
    return {
      content: input.content,
      degradedReason: input.degradedReason ?? null,
      matchedHighlights: [],
      policy,
      unmatchedHighlights: []
    };
  }

  const { matchedHighlights, unmatchedHighlights } = splitMatchedHighlights(input);
  const degradedReason = appendDegradedReason(
    input.degradedReason,
    unmatchedHighlights.length > 0 ? `Controlled context degraded: ${unmatchedHighlights.length} unmatched sidecar highlight(s)` : null,
    matchedHighlights.length === 0 ? 'Controlled context degraded: no sidecar highlights matched source body' : null
  );

  return resolveControlledContent({
    content: input.content,
    degradedReason,
    matchedHighlights,
    policy,
    sourceKind: input.sourceKind,
    sourceName: input.sourceName,
    unmatchedHighlights
  });
}
