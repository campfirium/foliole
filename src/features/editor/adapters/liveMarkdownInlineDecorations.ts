import type { Range } from '@codemirror/state';
import { Decoration, type EditorView, WidgetType } from '@codemirror/view';

import type { MarkdownImageMatch } from '../model/markdownImageMatches';

import type { EditorMissingAttachmentResourceHandler } from './EditorAdapter';
import { attachMarkdownImageResize } from './liveMarkdownImageResize';
import { createMarkdownImageWidgetDom, disposeMarkdownImageWidgetDom } from './liveMarkdownImages';
import { canReuseMarkdownImageWidgetDom, updateMarkdownImageWidgetDomRange } from './liveMarkdownImageWidgetDom';

function parseWidgetRangeValue(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function resolveCurrentImageMatchFromDom(dom: HTMLElement | null, imageMatch: MarkdownImageMatch): MarkdownImageMatch {
  if (!dom) {
    return imageMatch;
  }
  return {
    ...imageMatch,
    from: parseWidgetRangeValue(dom.dataset.mdImageFrom, imageMatch.from),
    to: parseWidgetRangeValue(dom.dataset.mdImageTo, imageMatch.to)
  };
}

class MarkdownImageWidget extends WidgetType {
  readonly editorNodeId: string | null;
  readonly imageMatch: MarkdownImageMatch;
  readonly localDocumentPath: string | null;
  readonly onMissingAttachmentResource: EditorMissingAttachmentResourceHandler | null;
  readonly presentationVersion: number;

  constructor(
    imageMatch: MarkdownImageMatch,
    editorNodeId: string | null,
    presentationVersion: number,
    onMissingAttachmentResource: EditorMissingAttachmentResourceHandler | null,
    localDocumentPath: string | null
  ) {
    super();
    this.editorNodeId = editorNodeId;
    this.imageMatch = imageMatch;
    this.localDocumentPath = localDocumentPath;
    this.onMissingAttachmentResource = onMissingAttachmentResource;
    this.presentationVersion = presentationVersion;
  }

  override eq(other: MarkdownImageWidget) {
    return (
      this.editorNodeId === other.editorNodeId &&
      this.presentationVersion === other.presentationVersion &&
      this.imageMatch.alt === other.imageMatch.alt &&
      this.imageMatch.attachmentId === other.imageMatch.attachmentId &&
      this.imageMatch.displayWidth === other.imageMatch.displayWidth &&
      this.imageMatch.from === other.imageMatch.from &&
      this.imageMatch.linkHref === other.imageMatch.linkHref &&
      this.localDocumentPath === other.localDocumentPath &&
      this.imageMatch.source === other.imageMatch.source &&
      this.imageMatch.to === other.imageMatch.to
    );
  }

  override ignoreEvent(event: Event) {
    return event.type !== 'click' && event.type !== 'auxclick';
  }

  override toDOM(view: EditorView) {
    let widgetDom: HTMLElement | null = null;
    widgetDom = createMarkdownImageWidgetDom(
      this.imageMatch,
      this.editorNodeId,
      this.onMissingAttachmentResource,
      () => view.requestMeasure(),
      () => removeMarkdownImage(view, resolveCurrentImageMatchFromDom(widgetDom, this.imageMatch)),
      this.presentationVersion,
      this.localDocumentPath
    );
    attachMarkdownImageResize(widgetDom, view, this.imageMatch);
    return widgetDom;
  }

  override updateDOM(dom: HTMLElement) {
    if (!canReuseMarkdownImageWidgetDom(dom, this.imageMatch, this.editorNodeId, this.presentationVersion)) {
      return false;
    }
    updateMarkdownImageWidgetDomRange(dom, this.imageMatch);
    return true;
  }

  override destroy(dom: HTMLElement) {
    disposeMarkdownImageWidgetDom(dom);
  }
}

function resolveMarkdownImageRemovalRange(view: EditorView, imageMatch: MarkdownImageMatch) {
  const line = view.state.doc.lineAt(imageMatch.from);
  const lineText = line.text;
  const imageText = view.state.doc.sliceString(imageMatch.from, imageMatch.to);
  if (lineText.trim() !== imageText.trim()) {
    return { from: imageMatch.from, to: imageMatch.to };
  }

  const from = line.from === 0 ? line.from : line.from - 1;
  const to = line.to < view.state.doc.length ? line.to + 1 : line.to;
  return { from, to };
}

function removeMarkdownImage(view: EditorView, imageMatch: MarkdownImageMatch) {
  const range = resolveMarkdownImageRemovalRange(view, imageMatch);
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: '' },
    selection: { anchor: range.from }
  });
  view.requestMeasure();
}

export function addImageDecorations(
  ranges: Range<Decoration>[],
  imageMatches: ReadonlyArray<MarkdownImageMatch>,
  preserveSource = false,
  editorNodeId: string | null = null,
  presentationVersion = 0,
  onMissingAttachmentResource: EditorMissingAttachmentResourceHandler | null = null,
  localDocumentPath: string | null = null
) {
  for (const imageMatch of imageMatches) {
    if (preserveSource) {
      ranges.push(
        Decoration.widget({
          side: 1,
          widget: new MarkdownImageWidget(imageMatch, editorNodeId, presentationVersion, onMissingAttachmentResource, localDocumentPath)
        }).range(imageMatch.to)
      );
      continue;
    }

    ranges.push(
      Decoration.replace({
        widget: new MarkdownImageWidget(imageMatch, editorNodeId, presentationVersion, onMissingAttachmentResource, localDocumentPath),
        inclusive: false
      }).range(
        imageMatch.from,
        imageMatch.to
      )
    );
  }
}
