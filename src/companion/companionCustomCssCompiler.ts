import postcss, { type Declaration, type Rule } from 'postcss';

import {
  getCompanionCustomCssUtf8Bytes,
  MAX_COMPANION_CUSTOM_CSS_TOTAL_COMPILED_BYTES,
  normalizeCompanionCustomCssCollection,
  type CompanionCustomCssCollection
} from './companionCustomCssModel';

export const COMPANION_CUSTOM_CSS_SCOPE_SELECTOR = '[data-companion-readable-document="true"]';

export type CompanionCustomCssCompilerCode =
  | 'compiled-size'
  | 'declaration'
  | 'selector'
  | 'structure'
  | 'syntax'
  | 'value';

export class CompanionCustomCssCompilerError extends Error {
  constructor(readonly code: CompanionCustomCssCompilerCode, message: string) {
    super(message);
    this.name = 'CompanionCustomCssCompilerError';
  }
}

export interface CompiledCompanionCustomCssCollection {
  collection: CompanionCustomCssCollection;
  compiledCss: string;
  compiledSnippets: Array<{ compiledCss: string; enabled: boolean; id: string }>;
}

const SAFE_PROPERTY = /^(?:--[a-z_][a-z0-9_-]*|-?[a-z][a-z0-9-]*)$/i;
const FORBIDDEN_PROPERTIES = new Set(['src', 'behavior', '-moz-binding']);
const FORBIDDEN_FUNCTION = /(?:^|[^a-z0-9_-])(?:url|src|image|image-set|-webkit-image-set|expression|element|-moz-element|paint|cross-fade|-webkit-cross-fade)\s*\(/i;
const FORBIDDEN_TAG_SELECTOR = /(^|[\s>+~,(])(?:html|body)(?![a-z0-9_-])/i;
const FORBIDDEN_MARKER_SELECTOR = /\[\s*data-companion-(?:readable|article)-document\b/i;

function rejectUnsafeText(value: string, code: CompanionCustomCssCompilerCode) {
  if (value.includes('\\') || value.includes('/*') || value.includes('*/')) {
    throw new CompanionCustomCssCompilerError(code, 'CSS escapes and embedded comments are not supported.');
  }
}

function compileSelector(selector: string) {
  const normalized = selector.trim();
  rejectUnsafeText(normalized, 'selector');
  if (
    !normalized
    || normalized.includes('&')
    || /:root(?![a-z0-9_-])/i.test(normalized)
    || FORBIDDEN_TAG_SELECTOR.test(normalized)
    || FORBIDDEN_MARKER_SELECTOR.test(normalized)
  ) {
    throw new CompanionCustomCssCompilerError('selector', 'This selector cannot be limited to Topic reading.');
  }
  return `${COMPANION_CUSTOM_CSS_SCOPE_SELECTOR} ${normalized}`;
}

function validateDeclaration(declaration: Declaration) {
  const property = declaration.prop.trim();
  const lowerProperty = property.toLowerCase();
  const rawPrefix = (declaration.raws.before ?? '').trim();
  const rawSeparator = declaration.raws.between ?? '';
  if (
    rawPrefix
    || !/^\s*:\s*$/.test(rawSeparator)
    || !SAFE_PROPERTY.test(property)
    || FORBIDDEN_PROPERTIES.has(lowerProperty)
  ) {
    throw new CompanionCustomCssCompilerError('declaration', 'This CSS property is not supported.');
  }
  rejectUnsafeText(declaration.value, 'value');
  if (FORBIDDEN_FUNCTION.test(declaration.value)) {
    throw new CompanionCustomCssCompilerError('value', 'External resources and script-like CSS values are not supported.');
  }
}

function validateRule(rule: Rule) {
  rejectUnsafeText(rule.raws.between ?? '', 'selector');
  let selectors: string[];
  try {
    selectors = rule.selectors;
  } catch {
    throw new CompanionCustomCssCompilerError('selector', 'This CSS selector is invalid.');
  }
  rule.selectors = selectors.map(compileSelector);
  for (const child of rule.nodes ?? []) {
    if (child.type === 'comment') continue;
    if (child.type !== 'decl') {
      throw new CompanionCustomCssCompilerError('structure', 'Nested CSS rules are not supported.');
    }
    validateDeclaration(child);
  }
}

export function compileCompanionCustomCssSource(sourceCss: string) {
  let root: ReturnType<typeof postcss.parse>;
  try {
    root = postcss.parse(sourceCss, { from: undefined });
  } catch {
    throw new CompanionCustomCssCompilerError('syntax', 'The CSS syntax is invalid.');
  }
  for (const node of root.nodes) {
    if (node.type === 'comment') continue;
    if (node.type !== 'rule') {
      throw new CompanionCustomCssCompilerError('structure', 'Only standard style rules are supported.');
    }
    validateRule(node);
  }
  root.walkComments((comment) => { comment.remove(); });
  return root.toString().trim();
}

export function compileCompanionCustomCssCollection(raw: unknown): CompiledCompanionCustomCssCollection {
  const collection = normalizeCompanionCustomCssCollection(raw);
  const compiledSnippets = collection.snippets.map((snippet) => ({
    compiledCss: compileCompanionCustomCssSource(snippet.sourceCss),
    enabled: snippet.enabled,
    id: snippet.id
  }));
  const totalCompiledBytes = compiledSnippets.reduce(
    (sum, snippet) => sum + getCompanionCustomCssUtf8Bytes(snippet.compiledCss),
    0
  );
  if (totalCompiledBytes > MAX_COMPANION_CUSTOM_CSS_TOTAL_COMPILED_BYTES) {
    throw new CompanionCustomCssCompilerError('compiled-size', 'The compiled custom style collection is too large.');
  }
  return {
    collection,
    compiledCss: compiledSnippets.filter((snippet) => snippet.enabled).map((snippet) => snippet.compiledCss).join('\n'),
    compiledSnippets
  };
}
