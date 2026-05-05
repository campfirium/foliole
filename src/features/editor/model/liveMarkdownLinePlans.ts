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
import { CODE_FENCE_PATTERN, createLineClass } from './markdownLineSyntax';

export interface PreviewLineDecorationPlan {
  footnoteMatches: ReturnType<typeof collectPreviewLineMatchState>['footnoteMatches'];
  imageMatches: MarkdownImageMatch[];
  imageVisible: boolean;
  inlinePresentationPlans: InlinePresentationPlan[];
  isCodeFenceLine: boolean;
  lineClass: string | null;
  nextInCodeBlock: boolean;
  prefixVisible: boolean;
  showSyntaxOnLine: boolean;
  textDecorationPlans: InlineTextDecorationPlan[];
}

export interface SourceLineDecorationPlan {
  footnoteMatches: ReturnType<typeof collectSourceLineMatchState>['footnoteMatches'];
  inlinePresentationPlans: InlinePresentationPlan[];
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

export function collectPreviewLineDecorationPlan(args: {
  hideTitleHeading: boolean;
  inCodeBlock: boolean;
  isCursorLine: boolean;
  lineFrom: number;
  lineNumber: number;
  lineText: string;
  markdownSyntaxVisible: boolean;
}): PreviewLineDecorationPlan {
  const isCodeFenceLine = CODE_FENCE_PATTERN.test(args.lineText);
  const showSyntaxOnLine = args.markdownSyntaxVisible && args.isCursorLine;
  const baseLineClass = createLineClass(args.lineText, args.inCodeBlock);
  const lineClass =
    args.hideTitleHeading && args.lineNumber === 1 && baseLineClass === 'cm-line-h1'
      ? 'cm-line-title-heading-hidden'
      : isCodeFenceLine && !showSyntaxOnLine
        ? 'cm-line-code-fence-hidden'
        : baseLineClass;
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
  lineFrom: number;
  lineText: string;
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
  const isCodeFenceLine = CODE_FENCE_PATTERN.test(args.lineText);

  return {
    footnoteMatches,
    inlinePresentationPlans: [
      collectInlineLinkPresentationPlan(inlineLinkMatches, true),
      collectWikiLinkPresentationPlan(wikiLinkMatches, true),
      collectAutolinkPresentationPlan(autolinkMatches)
    ],
    nextInCodeBlock: isCodeFenceLine ? !args.inCodeBlock : args.inCodeBlock,
    textDecorationPlans: [
      collectInlineCodeSyntaxDecorationPlan(inlineCodeMatches),
      collectInlineTokenDecorationPlan(args.lineFrom, args.lineText, args.inCodeBlock, true, preservedRanges.concat(footnoteRanges))
    ]
  };
}
