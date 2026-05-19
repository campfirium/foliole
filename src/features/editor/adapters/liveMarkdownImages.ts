import { buildRemoteImageRenderUrl } from '../../../../lib/platform/remoteImageProtocolUrl';
import {
  invalidateAttachmentResourceResolution,
  resolveRuntimeAttachmentResource
} from '../../../shared/platform/attachmentResources';
import { isNativeAndroidCompanionRuntime } from '../../../shared/platform/companionWorkspaceRuntimeRepository';
import { getImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';
import { buildMarkdownImageRenderPlan } from '../model/markdownImagePresentation';
import { shouldAutoLocalizeRemoteImages } from '../model/remoteImageLocalizationSetting';

import type { EditorMissingAttachmentResourceHandler } from './EditorAdapter';
import { createImageClozeImageSurface } from './imageClozeWidgetDom';
import { closeActiveRemoteImageFailureMenu } from './liveMarkdownImageContextMenu';
import {
  createMarkdownImageElement,
  type RequestEditorMeasure
} from './liveMarkdownImageElement';
import { createImageStatusElement } from './liveMarkdownImageStatus';
import {
  setMarkdownImageWidgetDomIdentity,
  updateMarkdownImageWidgetDomRange
} from './liveMarkdownImageWidgetDom';
import { createRemoteImageFailureStatus } from './liveMarkdownRemoteImageFailure';
import { createUnavailableImageStatus } from './liveMarkdownUnavailableImageStatus';

function createImageSurface(
  imageMatch: MarkdownImageMatch,
  source: string,
  editorNodeId: string | null = null,
  imageOptions: { deferSource?: boolean; onError?: (() => void) | null; onLoad?: (() => void) | null; requestMeasure?: RequestEditorMeasure } = {}
) {
  const presentation = getImageClozeEditorPresentation(editorNodeId);
  const imagePresentation =
    presentation && imageMatch.attachmentId && presentation.regions.some((region) => region.attachmentId === imageMatch.attachmentId)
      ? {
          ...presentation,
          regions: presentation.regions.filter((region) => region.attachmentId === imageMatch.attachmentId)
        }
      : null;
  return createImageClozeImageSurface({
    attachmentId: imageMatch.attachmentId,
    display: imageMatch.display,
    from: imageMatch.from,
    presentation: imagePresentation,
    renderImage: () =>
      createMarkdownImageElement({
        alt: imageMatch.alt,
        deferSource: imageOptions.deferSource ?? false,
        display: imageMatch.display,
        onError: imageOptions.onError ?? null,
        onLoad: imageOptions.onLoad ?? null,
        requestMeasure: imageOptions.requestMeasure ?? null,
        source
      }),
    previewAlt: imageMatch.alt,
    previewPresentation: imagePresentation,
    previewSource: source,
    to: imageMatch.to
  });
}

function appendLoadingImageSurface(
  wrapper: HTMLElement,
  imageMatch: MarkdownImageMatch,
  source: string,
  editorNodeId: string | null,
  requestMeasure: RequestEditorMeasure,
  onRemoveImage: (() => void) | null
) {
  wrapper.append(createImageStatusElement('loading', imageMatch.display));
  const surface = createImageSurface(imageMatch, source, editorNodeId, {
    deferSource: true,
    onError: () => {
      closeActiveRemoteImageFailureMenu();
      const retry = () => {
        const nextRetryKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const nextSource = buildRemoteRenderSource(imageMatch.source, editorNodeId, nextRetryKey);
        closeActiveRemoteImageFailureMenu();
        wrapper.replaceChildren();
        appendLoadingImageSurface(wrapper, imageMatch, nextSource, editorNodeId, requestMeasure, onRemoveImage);
        requestMeasure?.();
      };
      wrapper.replaceChildren(createRemoteImageFailureStatus({
        editorNodeId,
        imageMatch,
        onRemoveImage,
        onRetry: retry,
        requestMeasure
      }));
      requestMeasure?.();
    },
    onLoad: () => {
      closeActiveRemoteImageFailureMenu();
      surface.classList.remove('cm-md-image-surface-loading');
      surface.removeAttribute('aria-hidden');
      surface.removeAttribute('style');
      wrapper.replaceChildren(surface);
    },
    requestMeasure
  });
  surface.classList.add('cm-md-image-surface-loading');
  surface.setAttribute('aria-hidden', 'true');
  surface.style.height = '1px';
  surface.style.opacity = '0';
  surface.style.overflow = 'hidden';
  surface.style.pointerEvents = 'none';
  surface.style.position = 'absolute';
  surface.style.width = '1px';
  wrapper.append(surface);
}

function buildRemoteRenderSource(sourceUrl: string, editorNodeId: string | null, retryKey: string | null = null) {
  const shouldPersist = shouldAutoLocalizeRemoteImages() && Boolean(editorNodeId);
  return buildRemoteImageRenderUrl({
    nodeId: editorNodeId,
    persist: shouldPersist,
    retryKey,
    sourceUrl
  });
}

function appendResolvedAndroidAttachmentImage(
  wrapper: HTMLElement,
  imageMatch: MarkdownImageMatch,
  renderPlan: ReturnType<typeof buildMarkdownImageRenderPlan>,
  editorNodeId: string | null,
  onMissingAttachmentResource: EditorMissingAttachmentResourceHandler | null,
  requestMeasure: RequestEditorMeasure,
  onRemoveImage: (() => void) | null
) {
  wrapper.append(createImageStatusElement('loading', renderPlan.display));
  let didRetry = false;
  async function resolveImage() {
    const resolution = await resolveRuntimeAttachmentResource(imageMatch.source);
    if (resolution?.status !== 'ready' || !resolution.resource_url) {
      if (!didRetry && imageMatch.attachmentId && onMissingAttachmentResource) {
        didRetry = true;
        try {
          await onMissingAttachmentResource(imageMatch.attachmentId);
        } catch {
          wrapper.replaceChildren(createUnavailableImageStatus(imageMatch, onRemoveImage));
          requestMeasure?.();
          return;
        }
        invalidateAttachmentResourceResolution(imageMatch.attachmentId);
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
  presentationVersion = 0
) {
  const renderPlan = buildMarkdownImageRenderPlan(imageMatch);
  const wrapper = document.createElement('span');
  wrapper.className = imageMatch.display === 'block' ? 'cm-md-image-widget cm-md-image-widget-block' : 'cm-md-image-widget cm-md-image-widget-inline';
  setMarkdownImageWidgetDomIdentity(wrapper, imageMatch, editorNodeId, presentationVersion);
  updateMarkdownImageWidgetDomRange(wrapper, imageMatch);

  if (renderPlan.isRemote && renderPlan.imageSrc) {
    appendLoadingImageSurface(
      wrapper,
      imageMatch,
      buildRemoteRenderSource(renderPlan.imageSrc, editorNodeId),
      editorNodeId,
      requestMeasure,
      onRemoveImage
    );
    return wrapper;
  }

  if (renderPlan.browserImageSrc) {
    wrapper.append(createImageSurface(imageMatch, renderPlan.browserImageSrc, editorNodeId, { requestMeasure }));
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

  if (isNativeAndroidCompanionRuntime()) {
    appendResolvedAndroidAttachmentImage(wrapper, imageMatch, renderPlan, editorNodeId, onMissingAttachmentResource, requestMeasure, onRemoveImage);
    return wrapper;
  }

  wrapper.append(
    createImageSurface(imageMatch, attachmentSrc, editorNodeId, {
      onError: () => {
        closeActiveRemoteImageFailureMenu();
        wrapper.replaceChildren(createUnavailableImageStatus(imageMatch, onRemoveImage));
      },
      requestMeasure
    })
  );
  return wrapper;
}
