import {
  collectPreviewLineDecorationPlan,
  collectSourceLineDecorationPlan,
  type PreviewLineDecorationPlan,
  type SourceLineDecorationPlan
} from './liveMarkdownLinePlans';

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
  cursorLineNumber: number | null;
  hideTitleHeading: boolean;
  lines: ReadonlyArray<ViewportLineInput>;
  markdownSyntaxVisible: boolean;
  startInCodeBlock: boolean;
}): ViewportPreviewLinePlan[] {
  const plans: ViewportPreviewLinePlan[] = [];
  let inCodeBlock = args.startInCodeBlock;

  for (const line of args.lines) {
    const plan = collectPreviewLineDecorationPlan({
      hideTitleHeading: args.hideTitleHeading,
      inCodeBlock,
      isCursorLine: args.cursorLineNumber !== null && line.lineNumber === args.cursorLineNumber,
      lineFrom: line.from,
      lineNumber: line.lineNumber,
      lineText: line.text,
      markdownSyntaxVisible: args.markdownSyntaxVisible
    });
    plans.push({ lineFrom: line.from, lineText: line.text, plan });
    inCodeBlock = plan.nextInCodeBlock;
  }

  return plans;
}

export function collectSourceViewportPlans(args: {
  lines: ReadonlyArray<ViewportLineInput>;
  startInCodeBlock: boolean;
}): ViewportSourceLinePlan[] {
  const plans: ViewportSourceLinePlan[] = [];
  let inCodeBlock = args.startInCodeBlock;

  for (const line of args.lines) {
    const plan = collectSourceLineDecorationPlan({
      inCodeBlock,
      lineFrom: line.from,
      lineText: line.text
    });
    plans.push({ lineFrom: line.from, lineText: line.text, plan });
    inCodeBlock = plan.nextInCodeBlock;
  }

  return plans;
}
