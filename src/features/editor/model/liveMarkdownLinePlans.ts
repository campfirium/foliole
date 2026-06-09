import { collectPreviewLineMatchState, collectSourceLineMatchState } from './inlineLineMatchPlans';
import {
  collectAutolinkPresentationPlan,
  collectClozePlaceholderPresentationPlan,
  collectEmbedPresentationPlan,
  collectInlineCodePresentationPlan,
  collectInlineLinkPresentationPlan,
  collectWikiLinkPresentationPlan,
  type InlinePresentationPlan
} from './inlinePresentationPlans';
import {
  collectInlineCodeSyntaxDecorationPlan,
  collectInlineTokenDecorationPlan,
  collectDanglingNoteAsteriskDecorationPlan,
  collectEmphasisTextDecorationPlan,
  collectSourceHighlightDecorationPlan,
  collectStrongTextDecorationPlan,
  collectStrikethroughTextDecorationPlan,
  type InlineTextDecorationPlan
} from './inlineTextDecorationPlans';
import { collectImageMatches, type MarkdownImageMatch } from './markdownImageMatches';
import type { MarkdownLinkReferenceMap } from './markdownLinkReferences';
export interface PreviewLineDecorationPlan {
  escapedRanges: ReturnType<typeof collectPreviewLineMatchState>['escapedRanges'];
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

interface PreviewLineDecorationPlanArgs {
  hideTitleHeading: boolean;
  inCodeBlock: boolean;
  codeFenceLineFroms?: ReadonlySet<number>;
  isCursorLine: boolean;
  lineFrom: number;
  lineNumber: number;
  lineClassByFrom?: ReadonlyMap<number, string>;
  lineText: string;
  linkReferenceLineFroms?: ReadonlySet<number>;
  linkReferences?: MarkdownLinkReferenceMap;
  localDocumentPath?: string | null;
  markdownSyntaxVisible: boolean;
  thematicBreakLineFroms?: ReadonlySet<number>;
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
    collectDanglingNoteAsteriskDecorationPlan(args.lineFrom, args.lineText, args.inCodeBlock),
    collectEmphasisTextDecorationPlan(args.lineFrom, args.lineText, args.inCodeBlock),
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
  linkReferenceLineFroms?: ReadonlySet<number>;
  lineFrom: number;
  lineNumber: number;
  showSyntaxOnLine: boolean;
}) {
  const baseLineClass = args.isCodeFenceLine
    ? 'cm-line-code-fence'
    : args.inCodeBlock
      ? 'cm-line-code'
      : args.linkReferenceLineFroms?.has(args.lineFrom)
        ? 'cm-line-link-reference-hidden'
      : args.lineClassByFrom?.get(args.lineFrom) ?? null;
  return args.hideTitleHeading && args.lineNumber === 1 && baseLineClass === 'cm-line-h1'
    ? 'cm-line-title-heading-hidden'
    : args.isCodeFenceLine && !args.showSyntaxOnLine
      ? 'cm-line-code-fence-hidden'
    : baseLineClass;
}

function collectPreviewInlinePresentationPlans(args: {
  autolinkMatches: ReturnType<typeof collectPreviewLineMatchState>['autolinkMatches'];
  clozePlaceholderRanges: ReturnType<typeof collectPreviewLineMatchState>['clozePlaceholderRanges'];
  embedMatches: ReturnType<typeof collectPreviewLineMatchState>['embedMatches'];
  inlineCodeMatches: ReturnType<typeof collectPreviewLineMatchState>['inlineCodeMatches'];
  inlineLinkMatches: ReturnType<typeof collectPreviewLineMatchState>['inlineLinkMatches'];
  showSyntaxOnLine: boolean;
  wikiLinkMatches: ReturnType<typeof collectPreviewLineMatchState>['wikiLinkMatches'];
}) {
  const plans = [
    collectInlineCodePresentationPlan(args.inlineCodeMatches, args.showSyntaxOnLine),
    collectInlineLinkPresentationPlan(args.inlineLinkMatches, args.showSyntaxOnLine),
    collectWikiLinkPresentationPlan(args.wikiLinkMatches, args.showSyntaxOnLine),
    collectEmbedPresentationPlan(args.embedMatches, args.showSyntaxOnLine),
    collectAutolinkPresentationPlan(args.autolinkMatches, args.showSyntaxOnLine)
  ];
  if (args.clozePlaceholderRanges.length) plans.push(collectClozePlaceholderPresentationPlan(args.clozePlaceholderRanges));
  return plans;
}

export function collectPreviewLineDecorationPlan(args: PreviewLineDecorationPlanArgs): PreviewLineDecorationPlan {
  const isCodeFenceLine = args.codeFenceLineFroms?.has(args.lineFrom) ?? false;
  const showSyntaxOnLine = args.markdownSyntaxVisible && args.isCursorLine;
  const linkReferences = args.linkReferences ?? new Map();
  const lineClass = resolvePreviewLineClass({
    hideTitleHeading: args.hideTitleHeading,
    inCodeBlock: args.inCodeBlock,
    isCodeFenceLine,
    ...(args.lineClassByFrom ? { lineClassByFrom: args.lineClassByFrom } : {}),
    ...(args.linkReferenceLineFroms ? { linkReferenceLineFroms: args.linkReferenceLineFroms } : {}),
    lineFrom: args.lineFrom,
    lineNumber: args.lineNumber,
    showSyntaxOnLine
  });
  const imageMatches = collectImageMatches(args.lineFrom, args.lineText, linkReferences, {
    allowRelativeImages: Boolean(args.localDocumentPath)
  });
  const {
    autolinkMatches,
    clozePlaceholderRanges,
    embedMatches,
    escapedRanges,
    footnoteMatches,
    footnoteRanges,
    inlineCodeMatches,
    inlineLinkMatches,
    preservedRanges,
    wikiLinkMatches
  } = collectPreviewLineMatchState(args.lineFrom, args.lineText, args.inCodeBlock, imageMatches, linkReferences);

  return {
    escapedRanges,
    footnoteMatches,
    imageMatches,
    imageVisible: !args.inCodeBlock,
    inlinePresentationPlans: collectPreviewInlinePresentationPlans({
      autolinkMatches,
      clozePlaceholderRanges,
      embedMatches,
      inlineCodeMatches,
      inlineLinkMatches,
      showSyntaxOnLine,
      wikiLinkMatches
    }),
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
  linkReferences?: MarkdownLinkReferenceMap;
  thematicBreakLineFroms?: ReadonlySet<number>;
}): SourceLineDecorationPlan {
  const {
    autolinkMatches,
    clozePlaceholderRanges,
    embedMatches,
    footnoteMatches,
    footnoteRanges,
    inlineCodeMatches,
    inlineLinkMatches,
    preservedRanges,
    wikiLinkMatches
  } = collectSourceLineMatchState(args.lineFrom, args.lineText, args.inCodeBlock, args.linkReferences);
  const isCodeFenceLine = args.codeFenceLineFroms?.has(args.lineFrom) ?? false;

  return {
    footnoteMatches,
    inlinePresentationPlans: [
      collectInlineLinkPresentationPlan(inlineLinkMatches, true),
      collectWikiLinkPresentationPlan(wikiLinkMatches, true),
      collectEmbedPresentationPlan(embedMatches, true),
      collectAutolinkPresentationPlan(autolinkMatches, true),
      ...(clozePlaceholderRanges.length ? [collectClozePlaceholderPresentationPlan(clozePlaceholderRanges)] : [])
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
