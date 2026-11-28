import type { Range, Text } from '@codemirror/state';
import type { Decoration } from '@codemirror/view';

import { collectPreviewViewportPlans } from '../model/liveMarkdownViewportPlans';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';

import type { EditorMissingAttachmentResourceHandler } from './EditorAdapter';
import { addImageDecorations } from './liveMarkdownInlineDecorations';

/**
 * Images are many lines tall, so their decorations must outlive the viewport. Without them CodeMirror
 * re-estimates the line as source text and the document height jumps. No DOM is built off screen.
 */
export function addOffViewportImageDecorations(
  ranges: Range<Decoration>[],
  doc: Text,
  args: {
    codeLineFroms: ReadonlySet<number>;
    documentImageMatches: ReadonlyArray<MarkdownImageMatch>;
    imageClozePresentationVersion: number;
    localDocumentPath: string | null;
    markdownSyntaxVisible: boolean;
    nodeId: string | null;
    onMissingAttachmentResource: EditorMissingAttachmentResourceHandler | null;
    source: string;
    viewportLineFroms: ReadonlySet<number>;
  }
) {
  const imagesByLineFrom = new Map<number, MarkdownImageMatch[]>();
  for (const image of args.documentImageMatches) {
    const lineFrom = doc.lineAt(image.from).from;
    if (args.viewportLineFroms.has(lineFrom)) continue;
    const lineImages = imagesByLineFrom.get(lineFrom);
    if (lineImages) lineImages.push(image);
    else imagesByLineFrom.set(lineFrom, [image]);
  }

  for (const [lineFrom, lineImages] of imagesByLineFrom) {
    const line = doc.lineAt(lineFrom);
    const [linePlan] = collectPreviewViewportPlans({
      codeLineFroms: args.codeLineFroms,
      cursorLineNumber: null,
      documentImageMatches: lineImages,
      hideTitleHeading: false,
      lines: [{ from: line.from, lineNumber: line.number, text: line.text }],
      localDocumentPath: args.localDocumentPath,
      markdownSyntaxVisible: args.markdownSyntaxVisible,
      source: args.source,
      startInCodeBlock: false
    });
    if (!linePlan?.plan.imageVisible) continue;
    addImageDecorations(
      ranges,
      linePlan.plan.imageMatches,
      false,
      args.nodeId,
      args.imageClozePresentationVersion,
      args.onMissingAttachmentResource,
      args.localDocumentPath
    );
  }
}
