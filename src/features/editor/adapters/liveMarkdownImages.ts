import {
  invalidateAttachmentResourceResolution,
  resolveRuntimeAttachmentResource
} from '../../../shared/platform/attachmentResources';
import type { RemoteImageSourceContextState } from '../../../shared/platform/remoteImageSourceRecovery';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';
import { buildMarkdownImageRenderPlan } from '../model/markdownImagePresentation';

import type { EditorMissingAttachmentResourceHandler } from './EditorAdapter';
import { closeActiveRemoteImageFailureMenu } from './liveMarkdownImageContextMenu';
import {
  concealLoadingMarkdownImageSurface,
  finalizeLoadedMarkdownImageDisplay,
  resolveRemoteMarkdownImageDisplay,
  revealLoadedMarkdownImageSurface
} from './liveMarkdownImageDisplay';
import type { RequestEditorMeasure } from './liveMarkdownImageElement';
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
import { requestRemoteImageLocalization } from './remoteImageLocalizationEvents';

export { disposeMarkdownImageWidgetDom } from './liveMarkdownImageDisposal';

function appendLoadingImageSurface(
  wrapper: HTMLElement,
  imageMatch: MarkdownImageMatch,
  editorNodeId: string | null,
  requestMeasure: RequestEditorMeasure,
  onRemoveImage: (() => void) | null,
  existingContext?: RemoteImageSourceContextState,
  retryKey: string | null = null
) {
  wrapper.replaceChildren(createImageStatusElement('loading', imageMatch.display));
  let sourceContext = existingContext ?? null;
  const surface = createImageSurface(imageMatch, '', editorNodeId, {
    deferSource: true,
    onError: () => {
      const activeContext = sourceContext;
      if (!activeContext) return;
      closeActiveRemoteImageFailureMenu();
      const retry = () => appendLoadingImageSurface(
        wrapper, imageMatch, editorNodeId, requestMeasure, onRemoveImage, activeContext,
        `${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      wrapper.replaceChildren(createRemoteImageFailureStatus({
        editorNodeId,
        imageMatch,
        onRemoveImage,
        onRetry: retry,
        onSourceContextChanged: () => appendLoadingImageSurface(
          wrapper, imageMatch, editorNodeId, requestMeasure, onRemoveImage
        ),
        requestMeasure,
        sourceContext: activeContext
      }));
      requestMeasure?.();
    },
    onLoad: () => {
      closeActiveRemoteImageFailureMenu();
      revealLoadedMarkdownImageSurface(surface);
      wrapper.replaceChildren(surface);
      finalizeLoadedMarkdownImageDisplay(wrapper, imageMatch, requestMeasure);
    },
    requestMeasure
  });
  concealLoadingMarkdownImageSurface(surface);
  wrapper.append(surface);
  void resolveRemoteContextAndRender();
  async function resolveRemoteContextAndRender() {
    sourceContext = existingContext ?? await resolveRemoteRenderSourceContext(imageMatch.source, editorNodeId);
    resolveRemoteMarkdownImageDisplay({
      imageMatch, requestMeasure, retry: Boolean(retryKey), sourceOrigin: sourceContext.sourceOrigin, widget: wrapper
    });
    const source = buildRemoteRenderSource(imageMatch.source, editorNodeId, sourceContext, retryKey);
    const image = surface.querySelector<HTMLImageElement>('.cm-md-image-element');
    if (image) image.src = source;
  }
}

function appendResolvedAttachmentImage(
  wrapper: HTMLElement,
  imageMatch: MarkdownImageMatch,
  renderPlan: ReturnType<typeof buildMarkdownImageRenderPlan>,
  editorNodeId: string | null,
  onMissingAttachmentResource: EditorMissingAttachmentResourceHandler | null,
  requestMeasure: RequestEditorMeasure,
  onRemoveImage: (() => void) | null,
  onSurfaceReady: (() => void) | null
) {
  wrapper.append(createImageStatusElement('loading', renderPlan.display));
  let didRetry = false;
  let didRecover = false;
  async function resolveImage() {
    const resolution = await resolveRuntimeAttachmentResource(imageMatch.source, { refresh: true });
    if (resolution?.status !== 'ready' || !resolution.resource_url) {
      if (!didRecover && editorNodeId) {
        didRecover = true;
        const recovered = await requestRemoteImageLocalization(wrapper, {
          ...imageMatch, nodeId: editorNodeId, recovery: true
        });
        if (recovered) {
          invalidateAttachmentResourceResolution(imageMatch.source);
          await resolveImage();
          return;
        }
      }
      if (!didRetry && imageMatch.attachmentId && onMissingAttachmentResource) {
        didRetry = true;
        try {
          await onMissingAttachmentResource(imageMatch.attachmentId);
        } catch {
          wrapper.replaceChildren(createUnavailableImageStatus(imageMatch, onRemoveImage));
          requestMeasure?.();
          return;
        }
        invalidateAttachmentResourceResolution(imageMatch.source);
        await resolveImage();
        return;
      }
      wrapper.replaceChildren(createUnavailableImageStatus(imageMatch, onRemoveImage));
      requestMeasure?.();
      return;
    }
    wrapper.replaceChildren(
      createImageSurface(imageMatch, resolution.resource_url, editorNodeId, {
        onError: () => {
          closeActiveRemoteImageFailureMenu();
          wrapper.replaceChildren(createUnavailableImageStatus(imageMatch, onRemoveImage));
        },
        requestMeasure
      })
    );
    onSurfaceReady?.();
    requestMeasure?.();
  }
  void resolveImage();
}

export function createMarkdownImageWidgetDom(
  imageMatch: MarkdownImageMatch,
  editorNodeId: string | null = null,
  onMissingAttachmentResource: EditorMissingAttachmentResourceHandler | null = null,
  requestMeasure: RequestEditorMeasure = null,
  onRemoveImage: (() => void) | null = null,
  presentationVersion = 0,
  localDocumentPath: string | null = null,
  onSurfaceReady: (() => void) | null = null
) {
  const renderPlan = buildMarkdownImageRenderPlan(imageMatch);
  const localDocumentImageSrc = resolveLocalDocumentImageSource(imageMatch, localDocumentPath);
  const wrapper = document.createElement('span');
  wrapper.className = imageMatch.display === 'block' ? 'cm-md-image-widget cm-md-image-widget-block' : 'cm-md-image-widget cm-md-image-widget-inline';
  setMarkdownImageWidgetDomIdentity(wrapper, imageMatch, editorNodeId, presentationVersion);
  updateMarkdownImageWidgetDomRange(wrapper, imageMatch);

  if (renderPlan.isRemote && renderPlan.imageSrc) {
    appendLoadingImageSurface(
      wrapper,
      imageMatch,
      editorNodeId,
      requestMeasure,
      onRemoveImage
    );
    return wrapper;
  }

  if (renderPlan.browserImageSrc || localDocumentImageSrc) {
    wrapper.append(createImageSurface(imageMatch, renderPlan.browserImageSrc ?? localDocumentImageSrc!, editorNodeId, {
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

  appendResolvedAttachmentImage(
    wrapper,
    imageMatch,
    renderPlan,
    editorNodeId,
    onMissingAttachmentResource,
    requestMeasure,
    onRemoveImage,
    onSurfaceReady
  );
  return wrapper;
}
