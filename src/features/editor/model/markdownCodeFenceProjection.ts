import { folioleMarkdownParser } from './folioleMarkdownParser';
import type { MarkdownSyntaxTree } from './markdownLinkReferences';

type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

export interface MarkdownCodeFenceProjection {
  codeBlocks: readonly MarkdownCodeFenceBlock[];
  codeLineFroms: ReadonlySet<number>;
  fenceLineFroms: ReadonlySet<number>;
}

export type MarkdownCodeFenceLanguage = 'css' | 'html' | 'javascript' | 'json' | 'typescript';
export type MarkdownCodeFenceDiagramKind = 'mermaid';

export interface MarkdownCodeFenceBlock {
  blockFrom: number;
  blockTo: number;
  codeFrom: number;
  codeTo: number;
  diagramKind: MarkdownCodeFenceDiagramKind | null;
  language: MarkdownCodeFenceLanguage | null;
}

function findLineStart(source: string, position: number) {
  return source.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
}

function normalizeCodeFenceInfo(info: string): {
  diagramKind: MarkdownCodeFenceDiagramKind | null;
  language: MarkdownCodeFenceLanguage | null;
} {
  const language = info.trim().split(/\s+/, 1)[0]?.toLowerCase();
  if (language === 'mermaid') return { diagramKind: 'mermaid', language: null };
  if (language === 'js' || language === 'javascript' || language === 'jsx') return { diagramKind: null, language: 'javascript' };
  if (language === 'ts' || language === 'typescript' || language === 'tsx') return { diagramKind: null, language: 'typescript' };
  if (language === 'css') return { diagramKind: null, language: 'css' };
  if (language === 'html' || language === 'htm') return { diagramKind: null, language: 'html' };
  if (language === 'json') return { diagramKind: null, language: 'json' };
  return { diagramKind: null, language: null };
}

function collectLineStartsInRange(source: string, from: number, to: number) {
  const starts: number[] = [];
  let lineStart = findLineStart(source, from);
  while (lineStart < to) {
    starts.push(lineStart);
    const nextBreak = source.indexOf('\n', lineStart);
    if (nextBreak < 0 || nextBreak >= to) break;
    lineStart = nextBreak + 1;
  }
  return starts;
}

function visitCodeFenceNodes(args: {
  codeBlocks: MarkdownCodeFenceBlock[];
  codeLineFroms: Set<number>;
  fenceLineFroms: Set<number>;
  node: MarkdownSyntaxNode;
  offset: number;
  source: string;
}) {
  if (args.node.name === 'FencedCode') {
    collectCodeFenceNode(args);
    return;
  }

  for (let child = args.node.firstChild; child; child = child.nextSibling) {
    visitCodeFenceNodes({
      codeBlocks: args.codeBlocks,
      codeLineFroms: args.codeLineFroms,
      fenceLineFroms: args.fenceLineFroms,
      node: child,
      offset: args.offset,
      source: args.source
    });
  }
}

function collectCodeFenceNode(args: {
  codeBlocks: MarkdownCodeFenceBlock[];
  codeLineFroms: Set<number>;
  fenceLineFroms: Set<number>;
  node: MarkdownSyntaxNode;
  offset: number;
  source: string;
}) {
  let diagramKind: MarkdownCodeFenceDiagramKind | null = null;
  let language: MarkdownCodeFenceLanguage | null = null;
  for (let child = args.node.firstChild; child; child = child.nextSibling) {
    if (child.name === 'CodeMark') {
      args.fenceLineFroms.add(args.offset + findLineStart(args.source, child.from));
    }
    if (child.name === 'CodeInfo') {
      const info = normalizeCodeFenceInfo(args.source.slice(child.from, child.to));
      diagramKind = info.diagramKind;
      language = info.language;
    }
    if (child.name === 'CodeText') {
      args.codeBlocks.push({
        blockFrom: args.offset + args.node.from,
        blockTo: args.offset + args.node.to,
        codeFrom: args.offset + child.from,
        codeTo: args.offset + child.to,
        diagramKind,
        language
      });
      for (const lineStart of collectLineStartsInRange(args.source, child.from, child.to)) {
        args.codeLineFroms.add(args.offset + lineStart);
      }
    }
  }
}

export function collectMarkdownCodeFenceProjection(text: string, offset = 0): MarkdownCodeFenceProjection {
  return collectMarkdownCodeFenceProjectionFromTree(folioleMarkdownParser.parse(text), text, offset);
}

export function collectMarkdownCodeFenceProjectionFromTree(
  tree: MarkdownSyntaxTree,
  text: string,
  offset = 0
): MarkdownCodeFenceProjection {
  const codeBlocks: MarkdownCodeFenceBlock[] = [];
  const codeLineFroms = new Set<number>();
  const fenceLineFroms = new Set<number>();
  visitCodeFenceNodes({
    codeBlocks,
    codeLineFroms,
    fenceLineFroms,
    node: tree.topNode,
    offset,
    source: text
  });
  return { codeBlocks, codeLineFroms, fenceLineFroms };
}
