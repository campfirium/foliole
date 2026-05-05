import type { ImportSourceKind } from './contract.js';

export type ImportContextPolicy = 'full_text' | 'full_text_with_context' | 'context_only';
export type ImportSourceProfile = 'default' | 'epub' | 'body_with_highlight_sidecar';

export interface ImportSidecarHighlight {
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
  policy: ImportContextPolicy;
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function appendDegradedReason(...reasons: Array<string | null | undefined>) {
  const collected = reasons
    .map((reason) => reason?.trim())
    .filter((reason): reason is string => Boolean(reason));
  return collected.length > 0 ? Array.from(new Set(collected)).join('; ') : null;
}

function findParagraphBounds(content: string, startIndex: number, endIndex: number) {
  const beforeBreak = content.lastIndexOf('\n\n', startIndex);
  const afterBreak = content.indexOf('\n\n', endIndex);
  return {
    start: beforeBreak >= 0 ? beforeBreak + 2 : 0,
    end: afterBreak >= 0 ? afterBreak : content.length
  };
}

function findContextExcerpt(content: string, quote: string) {
  const normalizedQuote = quote.trim();
  if (!normalizedQuote) {
    return null;
  }
  const pattern = normalizedQuote
    .split(/\s+/)
    .map((segment) => escapePattern(segment))
    .join('\\s+');
  const match = new RegExp(pattern, 'i').exec(content);
  if (!match || match.index === undefined) {
    return null;
  }
  const bounds = findParagraphBounds(content, match.index, match.index + match[0].length);
  return content.slice(bounds.start, bounds.end).trim();
}

function renderContextAppendix(
  matchedHighlights: Array<{ excerpt: string; highlight: ImportSidecarHighlight }>,
  unmatchedHighlights: ImportSidecarHighlight[]
) {
  const sections: string[] = [];
  if (matchedHighlights.length > 0) {
    sections.push('## Imported Context');
    matchedHighlights.forEach(({ excerpt, highlight }, index) => {
      const heading = highlight.label?.trim() || `Highlight ${index + 1}`;
      sections.push(`### ${heading}`);
      sections.push(excerpt);
    });
  }
  if (unmatchedHighlights.length > 0) {
    sections.push('## Unmatched Sidecar Highlights');
    unmatchedHighlights.forEach((highlight, index) => {
      const label = highlight.label?.trim() || `Highlight ${index + 1}`;
      sections.push(`- ${label}: ${highlight.text.trim()}`);
    });
  }
  return sections.join('\n\n').trim();
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

export function applyControlledImportContext(input: ControlledImportContextInput): ControlledImportContextOutput {
  const policy = resolveImportContextPolicy(input);
  if ((input.highlightSidecar?.length ?? 0) === 0) {
    return {
      content: input.content,
      degradedReason: input.degradedReason ?? null,
      policy
    };
  }

  const matchedHighlights: Array<{ excerpt: string; highlight: ImportSidecarHighlight }> = [];
  const unmatchedHighlights: ImportSidecarHighlight[] = [];
  input.highlightSidecar?.forEach((highlight) => {
    const excerpt = findContextExcerpt(input.content, highlight.text);
    if (excerpt) {
      matchedHighlights.push({ excerpt, highlight });
      return;
    }
    unmatchedHighlights.push(highlight);
  });

  const appendix = renderContextAppendix(matchedHighlights, unmatchedHighlights);
  const degradedReason = appendDegradedReason(
    input.degradedReason,
    unmatchedHighlights.length > 0 ? `Controlled context degraded: ${unmatchedHighlights.length} unmatched sidecar highlight(s)` : null,
    matchedHighlights.length === 0 ? 'Controlled context degraded: no sidecar highlights matched source body' : null
  );

  if (policy === 'full_text') {
    return {
      content: input.content,
      degradedReason,
      policy
    };
  }

  if (appendix) {
    return {
      content: policy === 'context_only' ? appendix : `${input.content}\n\n${appendix}`,
      degradedReason,
      policy
    };
  }

  return {
    content: buildRetainedDegradedImportContent({
      reason: degradedReason ?? 'Controlled context unavailable',
      sourceKind: input.sourceKind,
      sourceName: input.sourceName
    }),
    degradedReason,
    policy
  };
}
