import type { RemoteImageSourceContextState } from '../../../shared/platform/remoteImageSourceRecovery';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';
import { buildMarkdownImageRenderPlan } from '../model/markdownImagePresentation';

import type { EditorMissingAttachmentResourceHandler } from './EditorAdapter';
import { appendResolvedAttachmentImage } from './liveMarkdownAttachmentImage';
import { closeActiveRemoteImageFailureMenu } from './liveMarkdownImageContextMenu';
import {
  concealLoadingMarkdownImageSurface,
  finalizeLoadedMarkdownImageDisplay,
  finalizeMarkdownImageDisplay,
  resolveRemoteMarkdownImageDisplay,
  revealLoadedMarkdownImageSurface
} from './liveMarkdownImageDisplay';
import { isMarkdownImageWidgetDomDisposed } from './liveMarkdownImageDisposal';
import type { RequestEditorMeasure } from './liveMarkdownImageElement';
import { forgetImage, readRememberedImage, rememberImage } from './liveMarkdownImageMemory';
import { createImageStatusElement } from './liveMarkdownImageStatus';
import { createImageSurface } from './liveMarkdownImageSurface';
import {
  setMarkdownImageWidgetDomIdentity,
  updateMarkdownImageWidgetDomRange
} from './liveMarkdownImageWidgetDom';
import { resolveLocalDocumentImageSource } from './liveMarkdownLocalDocumentImages';
import { createRemoteImageFailureStatus } from './liveMarkdownRemoteImageFailure';
import {
  buildRemoteRenderSource,
  resolveRemoteRenderSourceContext
} from './liveMarkdownRemoteRenderSource';
import { createUnavailableImageStatus } from './liveMarkdownUnavailableImageStatus';
import { reportRemoteImageDisplayed } from './remoteImageLocalizationEvents';

export { disposeMarkdownImageWidgetDom } from './liveMarkdownImageDisposal';

function showRemoteImageFailure(args: {
  activeContext: RemoteImageSourceContextState;
  editorNodeId: string | null;
  imageMatch: MarkdownImageMatch;
  isActive: () => boolean;
  onRemoveImage: (() => void) | null;
  onSurfaceReady: (() => void) | null;
  requestMeasure: RequestEditorMeasure;
  wrapper: HTMLElement;
}) {
  closeActiveRemoteImageFailureMenu();
  const retry = () => {
    if (!args.isActive()) return;
    appendLoadingImageSurface(
      args.wrapper, args.imageMatch, args.editorNodeId, args.requestMeasure, args.onRemoveImage,
      args.onSurfaceReady, args.activeContext, `${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  };
  args.wrapper.replaceChildren(createRemoteImageFailureStatus({
    editorNodeId: args.editorNodeId,
    imageMatch: args.imageMatch,
    onRemoveImage: args.onRemoveImage,
    onRetry: retry,
    onSourceContextChanged: () => {
      if (args.isActive()) appendLoadingImageSurface(
        args.wrapper, args.imageMatch, args.editorNodeId, args.requestMeasure, args.onRemoveImage, args.onSurfaceReady
      );
    },
    requestMeasure: args.requestMeasure,
    sourceContext: args.activeContext
  }));
  args.requestMeasure?.();
}

// The render source depends on the node's source context, so the same URL is remembered per node.
function remoteImageMemoryKey(imageMatch: MarkdownImageMatch, editorNodeId: string | null) {
  return `${editorNodeId ?? ''}\n${imageMatch.source}`;
}

function appendLoadingImageSurface(
  wrapper: HTMLElement,
  imageMatch: MarkdownImageMatch,
  editorNodeId: string | null,
  requestMeasure: RequestEditorMeasure,
  onRemoveImage: (() => void) | null,
  onSurfaceReady: (() => void) | null,
  existingContext?: RemoteImageSourceContextState,
  retryKey: string | null = null
) {
  const isActive = () => !isMarkdownImageWidgetDomDisposed(wrapper);
  wrapper.replaceChildren(createImageStatusElement('loading', imageMatch.display));
  let sourceContext = existingContext ?? null;
  const surface = createImageSurface(imageMatch, '', editorNodeId, {
    deferSource: true,
    isActive,
    onError: () => {
      const activeContext = sourceContext;
      if (!activeContext) return;
      showRemoteImageFailure({
        activeContext, editorNodeId, imageMatch, isActive, onRemoveImage, onSurfaceReady, requestMeasure, wrapper
      });
    },
    onLoad: () => {
      closeActiveRemoteImageFailureMenu();
      revealLoadedMarkdownImageSurface(surface);
      wrapper.replaceChildren(surface);
      const loadedSource = surface.querySelector<HTMLImageElement>('.cm-md-image-element')?.src;
      if (loadedSource) rememberImage(remoteImageMemoryKey(imageMatch, editorNodeId), wrapper, loadedSource);
      finalizeLoadedMarkdownImageDisplay(wrapper, imageMatch, requestMeasure);
      onSurfaceReady?.();
      if (editorNodeId) reportRemoteImageDisplayed(surface, editorNodeId, imageMatch.source);
    },
    requestMeasure
  });
  concealLoadingMarkdownImageSurface(surface);
  wrapper.append(surface);
  void resolveRemoteContextAndRender();
  async function resolveRemoteContextAndRender() {
    sourceContext = existingContext ?? await resolveRemoteRenderSourceContext(imageMatch.source, editorNodeId);
    if (!isActive()) return;
    resolveRemoteMarkdownImageDisplay({
      imageMatch, requestMeasure, retry: Boolean(retryKey), sourceOrigin: sourceContext.sourceOrigin, widget: wrapper
    });
    const source = buildRemoteRenderSource(imageMatch.source, editorNodeId, sourceContext, retryKey);
    const image = surface.querySelector<HTMLImageElement>('.cm-md-image-element');
    if (image) image.src = source;
  }
}

function appendRemoteImage(
  wrapper: HTMLElement,
  imageMatch: MarkdownImageMatch,
  editorNodeId: string | null,
  requestMeasure: RequestEditorMeasure,
  onRemoveImage: (() => void) | null,
  onSurfaceReady: (() => void) | null
) {
  const key = remoteImageMemoryKey(imageMatch, editorNodeId);
  const remembered = readRememberedImage(key);
  if (!remembered) {
    appendLoadingImageSurface(wrapper, imageMatch, editorNodeId, requestMeasure, onRemoveImage, onSurfaceReady);
    return;
  }
  const isActive = () => !isMarkdownImageWidgetDomDisposed(wrapper);
  // A failed or resized image goes back through the full loading flow.
  const reload = () => {
    forgetImage(key);
    appendLoadingImageSurface(wrapper, imageMatch, editorNodeId, requestMeasure, onRemoveImage, onSurfaceReady);
  };
  const surface = createImageSurface(imageMatch, remembered.resourceUrl, editorNodeId, {
    isActive,
    onError: reload,
    onLoad: () => {
      const image = surface.querySelector<HTMLImageElement>('.cm-md-image-element');
      if (image?.naturalWidth !== remembered.size.width || image.naturalHeight !== remembered.size.height) {
        reload();
        return;
      }
      onSurfaceReady?.();
      if (editorNodeId) reportRemoteImageDisplayed(surface, editorNodeId, imageMatch.source);
    },
    requestMeasure
  });
  wrapper.append(surface);
  finalizeMarkdownImageDisplay(wrapper, imageMatch, remembered.size, null);
}

export function createMarkdownImageWidgetDom(
  imageMatch: MarkdownImageMatch,
  editorNodeId: string | null = null,
  onMissingAttachmentResource: EditorMissingAttachmentResourceHandler | null = null,
  requestMeasure: RequestEditorMeasure = null,
  onRemoveImage: (() => void) | null = null,
  presentationVersion = 0,
  localDocumentPath: string | null = null,
  onSurfaceReady: (() => void) | null = null,
  retainedRemoteSource: string | null = null
) {
  const renderPlan = buildMarkdownImageRenderPlan(imageMatch);
  const localDocumentImageSrc = resolveLocalDocumentImageSource(imageMatch, localDocumentPath);
  const wrapper = document.createElement('span');
  wrapper.className = imageMatch.display === 'block' ? 'cm-md-image-widget cm-md-image-widget-block' : 'cm-md-image-widget cm-md-image-widget-inline';
  setMarkdownImageWidgetDomIdentity(wrapper, imageMatch, editorNodeId, presentationVersion);
  updateMarkdownImageWidgetDomRange(wrapper, imageMatch);

  if (retainedRemoteSource && imageMatch.attachmentId) {
    wrapper.append(createImageSurface(imageMatch, retainedRemoteSource, editorNodeId, {
      isActive: () => !isMarkdownImageWidgetDomDisposed(wrapper),
      onLoad: () => finalizeLoadedMarkdownImageDisplay(wrapper, imageMatch, requestMeasure),
      requestMeasure
    }));
    return wrapper;
  }

  if (renderPlan.isRemote && renderPlan.imageSrc) {
    appendRemoteImage(wrapper, imageMatch, editorNodeId, requestMeasure, onRemoveImage, onSurfaceReady);
    return wrapper;
  }

  if (renderPlan.browserImageSrc || localDocumentImageSrc) {
    wrapper.append(createImageSurface(imageMatch, renderPlan.browserImageSrc ?? localDocumentImageSrc!, editorNodeId, {
      isActive: () => !isMarkdownImageWidgetDomDisposed(wrapper),
      onLoad: () => finalizeLoadedMarkdownImageDisplay(wrapper, imageMatch, requestMeasure),
      requestMeasure
    }));
    return wrapper;
  }

  if (renderPlan.fallbackStatus) {
    wrapper.append(createUnavailableImageStatus(imageMatch, onRemoveImage));
    return wrapper;
  }

  const attachmentSrc = renderPlan.attachmentProtocolSrc;
  if (!attachmentSrc) {
    wrapper.append(createUnavailableImageStatus(imageMatch, onRemoveImage));
    return wrapper;
  }

  appendResolvedAttachmentImage({
    editorNodeId, imageMatch, onMissing: onMissingAttachmentResource, onRemove: onRemoveImage,
    onSurfaceReady, renderPlan, requestMeasure, wrapper
  });
  return wrapper;
}
