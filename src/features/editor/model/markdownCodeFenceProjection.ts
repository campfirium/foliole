import { folioleMarkdownParser } from './folioleMarkdownParser';

type MarkdownSyntaxTree = ReturnType<typeof folioleMarkdownParser.parse>;
type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

export interface MarkdownCodeFenceProjection {
  codeLineFroms: ReadonlySet<number>;
  fenceLineFroms: ReadonlySet<number>;
}

function findLineStart(source: string, position: number) {
  return source.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
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
      codeLineFroms: args.codeLineFroms,
      fenceLineFroms: args.fenceLineFroms,
      node: child,
      offset: args.offset,
      source: args.source
    });
  }
}

function collectCodeFenceNode(args: {
  codeLineFroms: Set<number>;
  fenceLineFroms: Set<number>;
  node: MarkdownSyntaxNode;
  offset: number;
  source: string;
}) {
  for (let child = args.node.firstChild; child; child = child.nextSibling) {
    if (child.name === 'CodeMark') {
      args.fenceLineFroms.add(args.offset + findLineStart(args.source, child.from));
    }
    if (child.name === 'CodeText') {
      for (const lineStart of collectLineStartsInRange(args.source, child.from, child.to)) {
        args.codeLineFroms.add(args.offset + lineStart);
      }
    }
  }
}

export function collectMarkdownCodeFenceProjection(text: string, offset = 0): MarkdownCodeFenceProjection {
  const tree = folioleMarkdownParser.parse(text);
  const codeLineFroms = new Set<number>();
  const fenceLineFroms = new Set<number>();
  visitCodeFenceNodes({
    codeLineFroms,
    fenceLineFroms,
    node: tree.topNode,
    offset,
    source: text
  });
  return { codeLineFroms, fenceLineFroms };
}
