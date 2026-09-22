import {
  invalidateAttachmentResourceResolution,
  resolveRuntimeAttachmentResource
} from '../../../shared/platform/attachmentResources';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';
import type { MarkdownImageRenderPlan } from '../model/markdownImagePresentation';

import type { EditorMissingAttachmentResourceHandler } from './EditorAdapter';
import { closeActiveRemoteImageFailureMenu } from './liveMarkdownImageContextMenu';
import { isMarkdownImageWidgetDomDisposed } from './liveMarkdownImageDisposal';
import type { RequestEditorMeasure } from './liveMarkdownImageElement';
import { createImageStatusElement } from './liveMarkdownImageStatus';
import { createImageSurface } from './liveMarkdownImageSurface';
import { createUnavailableImageStatus } from './liveMarkdownUnavailableImageStatus';
import { requestRemoteImageLocalization } from './remoteImageLocalizationEvents';

interface AttachmentImageContext {
  didRecover: boolean;
  didRetry: boolean;
  editorNodeId: string | null;
  imageMatch: MarkdownImageMatch;
  isActive: () => boolean;
  onMissing: EditorMissingAttachmentResourceHandler | null;
  onRemove: (() => void) | null;
  onSurfaceReady: (() => void) | null;
  requestMeasure: RequestEditorMeasure;
  wrapper: HTMLElement;
}

function showUnavailableAttachment(context: AttachmentImageContext) {
  if (!context.isActive()) return;
  context.wrapper.replaceChildren(createUnavailableImageStatus(context.imageMatch, context.onRemove));
  context.requestMeasure?.();
}

function showResolvedAttachment(context: AttachmentImageContext, source: string) {
  if (!context.isActive()) return;
  context.wrapper.replaceChildren(createImageSurface(context.imageMatch, source, context.editorNodeId, {
    isActive: context.isActive,
    onError: () => {
      closeActiveRemoteImageFailureMenu();
      showUnavailableAttachment(context);
    },
    requestMeasure: context.requestMeasure
  }));
  context.onSurfaceReady?.();
  context.requestMeasure?.();
}

async function recoverUnavailableAttachment(context: AttachmentImageContext) {
  if (!context.didRecover && context.editorNodeId) {
    context.didRecover = true;
    const recovered = await requestRemoteImageLocalization(context.wrapper, {
      ...context.imageMatch, nodeId: context.editorNodeId, recovery: true
    });
    if (!context.isActive()) return true;
    if (recovered) {
      invalidateAttachmentResourceResolution(context.imageMatch.source);
      await resolveAttachmentImage(context);
      return true;
    }
  }
  return retryMissingAttachment(context);
}

async function retryMissingAttachment(context: AttachmentImageContext) {
  const attachmentId = context.imageMatch.attachmentId;
  if (context.didRetry || !attachmentId || !context.onMissing) return false;
  context.didRetry = true;
  try {
    await context.onMissing(attachmentId);
  } catch {
    showUnavailableAttachment(context);
    return true;
  }
  if (!context.isActive()) return true;
  invalidateAttachmentResourceResolution(context.imageMatch.source);
  await resolveAttachmentImage(context);
  return true;
}

async function resolveAttachmentImage(context: AttachmentImageContext) {
  if (!context.isActive()) return;
  const resolution = await resolveRuntimeAttachmentResource(context.imageMatch.source, { refresh: true });
  if (!context.isActive()) return;
  if (resolution?.status === 'ready' && resolution.resource_url) {
    showResolvedAttachment(context, resolution.resource_url);
    return;
  }
  if (!await recoverUnavailableAttachment(context)) showUnavailableAttachment(context);
}

export function appendResolvedAttachmentImage(args: {
  editorNodeId: string | null;
  imageMatch: MarkdownImageMatch;
  onMissing: EditorMissingAttachmentResourceHandler | null;
  onRemove: (() => void) | null;
  onSurfaceReady: (() => void) | null;
  renderPlan: MarkdownImageRenderPlan;
  requestMeasure: RequestEditorMeasure;
  wrapper: HTMLElement;
}) {
  const context: AttachmentImageContext = {
    didRecover: false,
    didRetry: false,
    editorNodeId: args.editorNodeId,
    imageMatch: args.imageMatch,
    isActive: () => !isMarkdownImageWidgetDomDisposed(args.wrapper),
    onMissing: args.onMissing,
    onRemove: args.onRemove,
    onSurfaceReady: args.onSurfaceReady,
    requestMeasure: args.requestMeasure,
    wrapper: args.wrapper
  };
  args.wrapper.append(createImageStatusElement('loading', args.renderPlan.display));
  void resolveAttachmentImage(context);
}
