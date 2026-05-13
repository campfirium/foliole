import {
  collectPreviewLineDecorationPlan,
  collectSourceLineDecorationPlan,
  type PreviewLineDecorationPlan,
  type SourceLineDecorationPlan
} from './liveMarkdownLinePlans';
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
  markdownSyntaxVisible: boolean;
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
      ...(args.lineClassByFrom ? { lineClassByFrom: args.lineClassByFrom } : {}),
      ...(args.linkReferenceLineFroms ? { linkReferenceLineFroms: args.linkReferenceLineFroms } : {}),
      lineNumber: line.lineNumber,
      lineText: line.text,
      ...(args.linkReferences ? { linkReferences: args.linkReferences } : {}),
      markdownSyntaxVisible: args.markdownSyntaxVisible,
      ...(args.thematicBreakLineFroms ? { thematicBreakLineFroms: args.thematicBreakLineFroms } : {})
    });
    plans.push({ lineFrom: line.from, lineText: line.text, plan });
    inCodeBlock = args.codeLineFroms ? inCodeBlock : plan.nextInCodeBlock;
  }

  return plans;
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
