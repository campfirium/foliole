import { collectPreviewLineMatchState, collectSourceLineMatchState } from './inlineLineMatchPlans';
import {
  collectAutolinkPresentationPlan,
  collectInlineCodePresentationPlan,
  collectInlineLinkPresentationPlan,
  collectWikiLinkPresentationPlan,
  type InlinePresentationPlan
} from './inlinePresentationPlans';
import {
  collectInlineCodeSyntaxDecorationPlan,
  collectInlineTokenDecorationPlan,
  collectSourceHighlightDecorationPlan,
  collectStrongTextDecorationPlan,
  collectStrikethroughTextDecorationPlan,
  type InlineTextDecorationPlan
} from './inlineTextDecorationPlans';
import { collectImageMatches, type MarkdownImageMatch } from './markdownImageMatches';
export interface PreviewLineDecorationPlan {
  footnoteMatches: ReturnType<typeof collectPreviewLineMatchState>['footnoteMatches'];
  imageMatches: MarkdownImageMatch[];
  imageVisible: boolean;
  inlinePresentationPlans: InlinePresentationPlan[];
  isCodeFenceLine: boolean;
  isThematicBreak: boolean;
  lineClass: string | null;
  nextInCodeBlock: boolean;
  prefixVisible: boolean;
  showSyntaxOnLine: boolean;
  textDecorationPlans: InlineTextDecorationPlan[];
}

export interface SourceLineDecorationPlan {
  footnoteMatches: ReturnType<typeof collectSourceLineMatchState>['footnoteMatches'];
  inlinePresentationPlans: InlinePresentationPlan[];
  isCodeFenceLine: boolean;
  isThematicBreak: boolean;
  nextInCodeBlock: boolean;
  textDecorationPlans: InlineTextDecorationPlan[];
}

function collectPreviewTextDecorationPlans(args: {
  footnoteRanges: ReturnType<typeof collectPreviewLineMatchState>['footnoteRanges'];
  inCodeBlock: boolean;
  lineFrom: number;
  lineText: string;
  preservedRanges: ReturnType<typeof collectPreviewLineMatchState>['preservedRanges'];
  showSyntaxOnLine: boolean;
}): InlineTextDecorationPlan[] {
  const preservedRanges = args.preservedRanges.concat(args.footnoteRanges);
  return [
    collectInlineTokenDecorationPlan(args.lineFrom, args.lineText, args.inCodeBlock, args.showSyntaxOnLine, preservedRanges),
    collectStrongTextDecorationPlan(args.lineFrom, args.lineText, args.inCodeBlock),
    collectStrikethroughTextDecorationPlan(args.lineFrom, args.lineText, args.inCodeBlock),
    collectSourceHighlightDecorationPlan(
      args.lineFrom,
      args.lineText,
      args.inCodeBlock,
      args.showSyntaxOnLine,
      preservedRanges
    )
  ];
}

function resolvePreviewLineClass(args: {
  hideTitleHeading: boolean;
  inCodeBlock: boolean;
  isCodeFenceLine: boolean;
  lineClassByFrom?: ReadonlyMap<number, string>;
  lineFrom: number;
  lineNumber: number;
  showSyntaxOnLine: boolean;
}) {
  const baseLineClass = args.isCodeFenceLine
    ? 'cm-line-code-fence'
    : args.inCodeBlock
      ? 'cm-line-code'
      : args.lineClassByFrom?.get(args.lineFrom) ?? null;
  return args.hideTitleHeading && args.lineNumber === 1 && baseLineClass === 'cm-line-h1'
    ? 'cm-line-title-heading-hidden'
    : args.isCodeFenceLine && !args.showSyntaxOnLine
      ? 'cm-line-code-fence-hidden'
      : baseLineClass;
}

export function collectPreviewLineDecorationPlan(args: {
  hideTitleHeading: boolean;
  inCodeBlock: boolean;
  codeFenceLineFroms?: ReadonlySet<number>;
  isCursorLine: boolean;
  lineFrom: number;
  lineNumber: number;
  lineClassByFrom?: ReadonlyMap<number, string>;
  lineText: string;
  markdownSyntaxVisible: boolean;
  thematicBreakLineFroms?: ReadonlySet<number>;
}): PreviewLineDecorationPlan {
  const isCodeFenceLine = args.codeFenceLineFroms?.has(args.lineFrom) ?? false;
  const showSyntaxOnLine = args.markdownSyntaxVisible && args.isCursorLine;
  const lineClass = resolvePreviewLineClass({
    hideTitleHeading: args.hideTitleHeading,
    inCodeBlock: args.inCodeBlock,
    isCodeFenceLine,
    lineClassByFrom: args.lineClassByFrom,
    lineFrom: args.lineFrom,
    lineNumber: args.lineNumber,
    showSyntaxOnLine
  });
  const imageMatches = collectImageMatches(args.lineFrom, args.lineText);
  const {
    autolinkMatches,
    footnoteMatches,
    footnoteRanges,
    inlineCodeMatches,
    inlineLinkMatches,
    preservedRanges,
    wikiLinkMatches
  } = collectPreviewLineMatchState(args.lineFrom, args.lineText, args.inCodeBlock, imageMatches);

  return {
    footnoteMatches,
    imageMatches,
    imageVisible: !args.inCodeBlock,
    inlinePresentationPlans: [
      collectInlineCodePresentationPlan(inlineCodeMatches, showSyntaxOnLine),
      collectInlineLinkPresentationPlan(inlineLinkMatches, showSyntaxOnLine),
      collectWikiLinkPresentationPlan(wikiLinkMatches, showSyntaxOnLine),
      collectAutolinkPresentationPlan(autolinkMatches)
    ],
    isCodeFenceLine,
    isThematicBreak: args.thematicBreakLineFroms?.has(args.lineFrom) ?? false,
    lineClass,
    nextInCodeBlock: isCodeFenceLine ? !args.inCodeBlock : args.inCodeBlock,
    prefixVisible: !args.inCodeBlock || isCodeFenceLine,
    showSyntaxOnLine,
    textDecorationPlans: collectPreviewTextDecorationPlans({
      footnoteRanges,
      inCodeBlock: args.inCodeBlock,
      lineFrom: args.lineFrom,
      lineText: args.lineText,
      preservedRanges,
      showSyntaxOnLine
    })
  };
}

export function collectSourceLineDecorationPlan(args: {
  inCodeBlock: boolean;
  codeFenceLineFroms?: ReadonlySet<number>;
  lineFrom: number;
  lineText: string;
  thematicBreakLineFroms?: ReadonlySet<number>;
}): SourceLineDecorationPlan {
  const {
    autolinkMatches,
    footnoteMatches,
    footnoteRanges,
    inlineCodeMatches,
    inlineLinkMatches,
    preservedRanges,
    wikiLinkMatches
  } = collectSourceLineMatchState(args.lineFrom, args.lineText, args.inCodeBlock);
  const isCodeFenceLine = args.codeFenceLineFroms?.has(args.lineFrom) ?? false;

  return {
    footnoteMatches,
    inlinePresentationPlans: [
      collectInlineLinkPresentationPlan(inlineLinkMatches, true),
      collectWikiLinkPresentationPlan(wikiLinkMatches, true),
      collectAutolinkPresentationPlan(autolinkMatches)
    ],
    isCodeFenceLine,
    isThematicBreak: args.thematicBreakLineFroms?.has(args.lineFrom) ?? false,
    nextInCodeBlock: isCodeFenceLine ? !args.inCodeBlock : args.inCodeBlock,
    textDecorationPlans: [
      collectInlineCodeSyntaxDecorationPlan(inlineCodeMatches),
      collectInlineTokenDecorationPlan(args.lineFrom, args.lineText, args.inCodeBlock, true, preservedRanges.concat(footnoteRanges))
    ]
  };
}
