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
import {
  createMarkdownImageElement,
  type RequestEditorMeasure
} from './liveMarkdownImageElement';

function parseImageRange(value: number) {
  return Number.isInteger(value) && value >= 0 ? String(value) : '';
}

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
  requestMeasure: RequestEditorMeasure
) {
  wrapper.append(createImageStatusElement('loading', imageMatch.display));
  const surface = createImageSurface(imageMatch, source, editorNodeId, {
    deferSource: true,
    onError: () => {
      wrapper.replaceChildren(createImageStatusElement('unavailable', imageMatch.display));
    },
    onLoad: () => {
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

function buildRemoteRenderSource(sourceUrl: string, editorNodeId: string | null) {
  const shouldPersist = shouldAutoLocalizeRemoteImages() && Boolean(editorNodeId);
  return buildRemoteImageRenderUrl({
    nodeId: shouldPersist ? editorNodeId : null,
    persist: shouldPersist,
    sourceUrl
  });
}

function createImageStatusElement(status: 'loading' | 'unavailable', display: MarkdownImageMatch['display']) {
  const element = document.createElement('span');
  element.className = display === 'inline' ? 'cm-md-image-status cm-md-image-status-inline' : 'cm-md-image-status cm-md-image-status-block';
  element.dataset.mdImageStatus = status;
  element.textContent = status === 'loading' ? '' : 'Image unavailable';
  return element;
}

function appendResolvedAndroidAttachmentImage(
  wrapper: HTMLElement,
  imageMatch: MarkdownImageMatch,
  renderPlan: ReturnType<typeof buildMarkdownImageRenderPlan>,
  editorNodeId: string | null,
  onMissingAttachmentResource: EditorMissingAttachmentResourceHandler | null,
  requestMeasure: RequestEditorMeasure
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
          wrapper.replaceChildren(createImageStatusElement('unavailable', renderPlan.display));
          requestMeasure?.();
          return;
        }
        invalidateAttachmentResourceResolution(imageMatch.attachmentId);
        await resolveImage();
        return;
      }
      wrapper.replaceChildren(createImageStatusElement('unavailable', renderPlan.display));
      requestMeasure?.();
      return;
    }
    wrapper.replaceChildren(
      createImageSurface(imageMatch, resolution.resource_url, editorNodeId, {
        onError: () => {
          wrapper.replaceChildren(createImageStatusElement('unavailable', renderPlan.display));
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
  requestMeasure: RequestEditorMeasure = null
) {
  const renderPlan = buildMarkdownImageRenderPlan(imageMatch);
  const wrapper = document.createElement('span');
  wrapper.className = imageMatch.display === 'block' ? 'cm-md-image-widget cm-md-image-widget-block' : 'cm-md-image-widget cm-md-image-widget-inline';
  wrapper.dataset.mdImageAlt = imageMatch.alt;
  wrapper.dataset.mdImageAttachmentId = imageMatch.attachmentId ?? '';
  wrapper.dataset.mdImageDisplay = imageMatch.display;
  wrapper.dataset.mdImageFrom = parseImageRange(imageMatch.from);
  wrapper.dataset.mdImageSource = imageMatch.source;
  wrapper.dataset.mdImageTo = parseImageRange(imageMatch.to);

  if (renderPlan.isRemote && renderPlan.imageSrc) {
    appendLoadingImageSurface(wrapper, imageMatch, buildRemoteRenderSource(renderPlan.imageSrc, editorNodeId), editorNodeId, requestMeasure);
    return wrapper;
  }

  if (renderPlan.browserImageSrc) {
    wrapper.append(createImageSurface(imageMatch, renderPlan.browserImageSrc, editorNodeId, { requestMeasure }));
    return wrapper;
  }

  if (renderPlan.fallbackStatus) {
    wrapper.append(createImageStatusElement(renderPlan.fallbackStatus, renderPlan.display));
    return wrapper;
  }

  const attachmentSrc = renderPlan.attachmentProtocolSrc;
  if (!attachmentSrc) {
    wrapper.append(createImageStatusElement('unavailable', renderPlan.display));
    return wrapper;
  }

  if (isNativeAndroidCompanionRuntime()) {
    appendResolvedAndroidAttachmentImage(wrapper, imageMatch, renderPlan, editorNodeId, onMissingAttachmentResource, requestMeasure);
    return wrapper;
  }

  wrapper.append(
    createImageSurface(imageMatch, attachmentSrc, editorNodeId, {
      onError: () => {
        wrapper.replaceChildren(createImageStatusElement('unavailable', renderPlan.display));
      },
      requestMeasure
    })
  );
  return wrapper;
}
