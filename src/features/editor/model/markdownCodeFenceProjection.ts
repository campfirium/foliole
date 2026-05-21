import { folioleMarkdownParser } from './folioleMarkdownParser';

type MarkdownSyntaxTree = ReturnType<typeof folioleMarkdownParser.parse>;
type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

export interface MarkdownCodeFenceProjection {
  codeBlocks: readonly MarkdownCodeFenceBlock[];
  codeLineFroms: ReadonlySet<number>;
  fenceLineFroms: ReadonlySet<number>;
}

export type MarkdownCodeFenceLanguage = 'css' | 'html' | 'javascript' | 'json' | 'typescript';

export interface MarkdownCodeFenceBlock {
  codeFrom: number;
  codeTo: number;
  language: MarkdownCodeFenceLanguage | null;
}

function findLineStart(source: string, position: number) {
  return source.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
}

function normalizeCodeFenceLanguage(info: string): MarkdownCodeFenceLanguage | null {
  const language = info.trim().split(/\s+/, 1)[0]?.toLowerCase();
  if (!language) return null;
  if (language === 'js' || language === 'javascript' || language === 'jsx') return 'javascript';
  if (language === 'ts' || language === 'typescript' || language === 'tsx') return 'typescript';
  if (language === 'css') return 'css';
  if (language === 'html' || language === 'htm') return 'html';
  if (language === 'json') return 'json';
  return null;
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
  let language: MarkdownCodeFenceLanguage | null = null;
  for (let child = args.node.firstChild; child; child = child.nextSibling) {
    if (child.name === 'CodeMark') {
      args.fenceLineFroms.add(args.offset + findLineStart(args.source, child.from));
    }
    if (child.name === 'CodeInfo') {
      language = normalizeCodeFenceLanguage(args.source.slice(child.from, child.to));
    }
    if (child.name === 'CodeText') {
      args.codeBlocks.push({
        codeFrom: args.offset + child.from,
        codeTo: args.offset + child.to,
        language
      });
      for (const lineStart of collectLineStartsInRange(args.source, child.from, child.to)) {
        args.codeLineFroms.add(args.offset + lineStart);
      }
    }
  }
}

export function collectMarkdownCodeFenceProjection(text: string, offset = 0): MarkdownCodeFenceProjection {
  const tree = folioleMarkdownParser.parse(text);
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
