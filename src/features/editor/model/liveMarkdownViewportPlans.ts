import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../../../lib/core/import/markdownImageReferences';

import {
  collectPreviewLineDecorationPlan,
  collectSourceLineDecorationPlan,
  type PreviewLineDecorationPlan,
  type SourceLineDecorationPlan
} from './liveMarkdownLinePlans';
import type { MarkdownImageMatch } from './markdownImageMatches';
import type { MarkdownLinkReferenceMap } from './markdownLinkReferences';

export interface ViewportLineInput {
  from: number;
  lineNumber: number;
  text: string;
}

export interface ViewportPreviewLinePlan {
  lineFrom: number;
  lineText: string;
  plan: PreviewLineDecorationPlan;
}

export interface ViewportSourceLinePlan {
  lineFrom: number;
  lineText: string;
  plan: SourceLineDecorationPlan;
}

export function collectPreviewViewportPlans(args: {
  codeFenceLineFroms?: ReadonlySet<number>;
  codeLineFroms?: ReadonlySet<number>;
  cursorLineNumber: number | null;
  hideTitleHeading: boolean;
  lineClassByFrom?: ReadonlyMap<number, string>;
  linkReferenceLineFroms?: ReadonlySet<number>;
  lines: ReadonlyArray<ViewportLineInput>;
  linkReferences?: MarkdownLinkReferenceMap;
  localDocumentPath?: string | null;
  markdownSyntaxVisible: boolean;
  documentImageMatches?: ReadonlyArray<MarkdownImageMatch>;
  source: string;
  startInCodeBlock: boolean;
  thematicBreakLineFroms?: ReadonlySet<number>;
}): ViewportPreviewLinePlan[] {
  const plans: ViewportPreviewLinePlan[] = [];
  let inCodeBlock = args.startInCodeBlock;

  for (const line of args.lines) {
    const lineInCodeBlock = args.codeLineFroms?.has(line.from) ?? inCodeBlock;
    const plan = collectPreviewLineDecorationPlan({
      hideTitleHeading: args.hideTitleHeading,
      ...(args.codeFenceLineFroms ? { codeFenceLineFroms: args.codeFenceLineFroms } : {}),
      inCodeBlock: lineInCodeBlock,
      isCursorLine: args.cursorLineNumber !== null && line.lineNumber === args.cursorLineNumber,
      lineFrom: line.from,
      ...optionalLineImageMatches(line, args.source, args.documentImageMatches),
      ...(args.lineClassByFrom ? { lineClassByFrom: args.lineClassByFrom } : {}),
      ...(args.linkReferenceLineFroms ? { linkReferenceLineFroms: args.linkReferenceLineFroms } : {}),
      lineNumber: line.lineNumber,
      lineText: line.text,
      ...(args.linkReferences ? { linkReferences: args.linkReferences } : {}),
      localDocumentPath: args.localDocumentPath ?? null,
      markdownSyntaxVisible: args.markdownSyntaxVisible,
      ...(args.thematicBreakLineFroms ? { thematicBreakLineFroms: args.thematicBreakLineFroms } : {})
    });
    plans.push({
      lineFrom: line.from,
      lineText: line.text,
      plan
    });
    inCodeBlock = args.codeLineFroms ? inCodeBlock : plan.nextInCodeBlock;
  }

  return plans;
}

function optionalLineImageMatches(
  line: ViewportLineInput,
  source: string,
  documentImageMatches: ReadonlyArray<MarkdownImageMatch> | undefined
) {
  if (!documentImageMatches) return {};
  const lineTo = line.from + line.text.length;
  return {
    imageMatches: documentImageMatches.flatMap((image) => {
      if (image.from >= line.from && image.to <= lineTo) return [image];
      const lineImage = collectMarkdownImageReferences(source.slice(line.from, lineTo))
        .find((reference) => parseMarkdownImageTarget(reference.rawTarget)?.destination === image.source);
      if (!lineImage) {
        return [];
      }
      const display: MarkdownImageMatch['display'] = line.text.trim() === lineImage.fullMatch ? 'block' : 'inline';
      return [{
        ...image,
        display,
        from: line.from + lineImage.start,
        to: line.from + lineImage.end
      }];
    })
  };
}

export function collectSourceViewportPlans(args: {
  codeFenceLineFroms?: ReadonlySet<number>;
  codeLineFroms?: ReadonlySet<number>;
  lines: ReadonlyArray<ViewportLineInput>;
  linkReferences?: MarkdownLinkReferenceMap;
  startInCodeBlock: boolean;
  thematicBreakLineFroms?: ReadonlySet<number>;
}): ViewportSourceLinePlan[] {
  const plans: ViewportSourceLinePlan[] = [];
  let inCodeBlock = args.startInCodeBlock;

  for (const line of args.lines) {
    const lineInCodeBlock = args.codeLineFroms?.has(line.from) ?? inCodeBlock;
    const plan = collectSourceLineDecorationPlan({
      ...(args.codeFenceLineFroms ? { codeFenceLineFroms: args.codeFenceLineFroms } : {}),
      inCodeBlock: lineInCodeBlock,
      lineFrom: line.from,
      lineText: line.text,
      ...(args.linkReferences ? { linkReferences: args.linkReferences } : {}),
      ...(args.thematicBreakLineFroms ? { thematicBreakLineFroms: args.thematicBreakLineFroms } : {})
    });
    plans.push({ lineFrom: line.from, lineText: line.text, plan });
    inCodeBlock = args.codeLineFroms ? inCodeBlock : plan.nextInCodeBlock;
  }

  return plans;
}
