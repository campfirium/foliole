import type { Range } from '@codemirror/state';
import { Decoration } from '@codemirror/view';

import type { MarkdownCodeFenceBlock, MarkdownCodeFenceLanguage } from '../model/markdownCodeFenceProjection';

import { addMark } from './liveMarkdownPrimitives';

type CodeFenceTokenKind =
  | 'atom'
  | 'attribute'
  | 'comment'
  | 'definition'
  | 'keyword'
  | 'number'
  | 'operator'
  | 'property'
  | 'string'
  | 'tag'
  | 'type'
  | 'variable';

interface CodeFenceToken {
  from: number;
  kind: CodeFenceTokenKind;
  to: number;
}

const JS_KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'from', 'function', 'if', 'import',
  'in', 'instanceof', 'interface', 'let', 'new', 'of', 'return', 'satisfies', 'switch', 'throw', 'try',
  'type', 'typeof', 'var', 'void', 'while', 'yield'
]);
const JS_ATOMS = new Set(['false', 'null', 'true', 'undefined']);

function isIdentifierStart(char: string) {
  return /[A-Za-z_$]/.test(char);
}

function isIdentifierChar(char: string) {
  return /[A-Za-z0-9_$-]/.test(char);
}

function scanQuotedString(code: string, from: number) {
  const quote = code[from];
  let index = from + 1;
  while (index < code.length) {
    if (code[index] === '\\') {
      index += 2;
      continue;
    }
    if (code[index] === quote) return index + 1;
    index += 1;
  }
  return index;
}

function scanNumber(code: string, from: number) {
  const match = /^[0-9]+(?:\.[0-9]+)?/.exec(code.slice(from));
  return from + (match?.[0].length ?? 1);
}

function scanBlockComment(code: string, from: number) {
  const end = code.indexOf('*/', from + 2);
  return end < 0 ? code.length : end + 2;
}

function scanLineComment(code: string, from: number) {
  const end = code.indexOf('\n', from + 2);
  return end < 0 ? code.length : end;
}

function scanScriptLikeTokens(code: string) {
  const tokens: CodeFenceToken[] = [];
  let index = 0;
  while (index < code.length) {
    const char = code[index];
    if (code.startsWith('//', index)) {
      const to = scanLineComment(code, index);
      tokens.push({ from: index, kind: 'comment', to });
      index = to;
    } else if (code.startsWith('/*', index)) {
      const to = scanBlockComment(code, index);
      tokens.push({ from: index, kind: 'comment', to });
      index = to;
    } else if (char === '"' || char === '\'' || char === '`') {
      const to = scanQuotedString(code, index);
      tokens.push({ from: index, kind: 'string', to });
      index = to;
    } else if (/[0-9]/.test(char)) {
      const to = scanNumber(code, index);
      tokens.push({ from: index, kind: 'number', to });
      index = to;
    } else if (isIdentifierStart(char)) {
      const to = scanIdentifier(code, index);
      const word = code.slice(index, to);
      const kind = JS_KEYWORDS.has(word) ? 'keyword' : JS_ATOMS.has(word) ? 'atom' : 'variable';
      tokens.push({ from: index, kind, to });
      index = to;
    } else {
      index += 1;
    }
  }
  return tokens;
}

function scanIdentifier(code: string, from: number) {
  let index = from + 1;
  while (index < code.length && isIdentifierChar(code[index])) index += 1;
  return index;
}

function nextNonSpace(code: string, from: number) {
  let index = from;
  while (index < code.length && /\s/.test(code[index])) index += 1;
  return index;
}

function scanCssTokens(code: string) {
  return scanScriptLikeTokens(code).map((token): CodeFenceToken => {
    if (token.kind !== 'variable') return token;
    const next = nextNonSpace(code, token.to);
    if (code[next] === ':') return { ...token, kind: 'property' };
    if (code[token.from - 1] === '@') return { ...token, kind: 'keyword' };
    return token;
  });
}

function scanHtmlTokens(code: string) {
  const tokens: CodeFenceToken[] = [];
  let index = 0;
  while (index < code.length) {
    if (code.startsWith('<!--', index)) {
      const end = code.indexOf('-->', index + 4);
      const to = end < 0 ? code.length : end + 3;
      tokens.push({ from: index, kind: 'comment', to });
      index = to;
    } else if (code[index] === '<') {
      index = scanHtmlTag(code, index, tokens);
    } else {
      index += 1;
    }
  }
  return tokens;
}

function scanHtmlTag(code: string, from: number, tokens: CodeFenceToken[]) {
  let index = from + (code[from + 1] === '/' ? 2 : 1);
  if (isIdentifierStart(code[index])) {
    const to = scanIdentifier(code, index);
    tokens.push({ from: index, kind: 'tag', to });
    index = to;
  }
  while (index < code.length && code[index] !== '>') {
    const char = code[index];
    if (char === '"' || char === '\'') {
      const to = scanQuotedString(code, index);
      tokens.push({ from: index, kind: 'string', to });
      index = to;
    } else if (isIdentifierStart(char)) {
      const to = scanIdentifier(code, index);
      tokens.push({ from: index, kind: 'attribute', to });
      index = to;
    } else {
      index += 1;
    }
  }
  return Math.min(code.length, index + 1);
}

function collectCodeFenceTokens(code: string, language: MarkdownCodeFenceLanguage) {
  if (language === 'css') return scanCssTokens(code);
  if (language === 'html') return scanHtmlTokens(code);
  return scanScriptLikeTokens(code);
}

function shouldHighlightCodeBlock(
  block: MarkdownCodeFenceBlock,
  viewport: { from: number; to: number }
): block is MarkdownCodeFenceBlock & { language: MarkdownCodeFenceLanguage } {
  return block.language !== null && block.codeFrom < viewport.to && block.codeTo > viewport.from;
}

export function addCodeFenceSyntaxHighlightDecorations(
  ranges: Range<Decoration>[],
  source: string,
  codeBlocks: readonly MarkdownCodeFenceBlock[],
  viewport: { from: number; to: number }
) {
  for (const block of codeBlocks) {
    if (!shouldHighlightCodeBlock(block, viewport)) continue;

    const code = source.slice(block.codeFrom, block.codeTo);
    for (const token of collectCodeFenceTokens(code, block.language)) {
      addMark(ranges, block.codeFrom + token.from, block.codeFrom + token.to, `cm-md-code-tok-${token.kind}`);
    }
  }
}
