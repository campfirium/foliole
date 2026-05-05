import type { Range } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

import type { MarkdownImageMatch } from '../model/markdownImageMatches';

import { createMarkdownImageWidgetDom } from './liveMarkdownImages';

class MarkdownImageWidget extends WidgetType {
  readonly editorNodeId: string | null;
  readonly imageMatch: MarkdownImageMatch;
  readonly presentationVersion: number;

  constructor(imageMatch: MarkdownImageMatch, editorNodeId: string | null, presentationVersion: number) {
    super();
    this.editorNodeId = editorNodeId;
    this.imageMatch = imageMatch;
    this.presentationVersion = presentationVersion;
  }

  eq(other: MarkdownImageWidget) {
    return (
      this.editorNodeId === other.editorNodeId &&
      this.presentationVersion === other.presentationVersion &&
      this.imageMatch.alt === other.imageMatch.alt &&
      this.imageMatch.attachmentId === other.imageMatch.attachmentId &&
      this.imageMatch.from === other.imageMatch.from &&
      this.imageMatch.source === other.imageMatch.source &&
      this.imageMatch.to === other.imageMatch.to
    );
  }

  toDOM() {
    return createMarkdownImageWidgetDom(this.imageMatch, this.editorNodeId);
  }
}

export function addImageDecorations(
  ranges: Range<Decoration>[],
  imageMatches: ReadonlyArray<MarkdownImageMatch>,
  preserveSource = false,
  editorNodeId: string | null = null,
  presentationVersion = 0
) {
  for (const imageMatch of imageMatches) {
    if (preserveSource) {
      ranges.push(
        Decoration.widget({
          side: 1,
          widget: new MarkdownImageWidget(imageMatch, editorNodeId, presentationVersion)
        }).range(imageMatch.to)
      );
      continue;
    }

    ranges.push(
      Decoration.replace({
        widget: new MarkdownImageWidget(imageMatch, editorNodeId, presentationVersion),
        inclusive: false
      }).range(
        imageMatch.from,
        imageMatch.to
      )
    );
  }
}
