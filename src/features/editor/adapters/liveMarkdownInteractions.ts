import { EditorView } from '@codemirror/view';

import { serializeStructuredClipboardPayload } from '../model/anchorClipboardPayload';
import type { EditorNodeLinkPreviewRequest } from '../model/nodeLinkPreview';

import { createClipboardExportFromView, FOLIOLE_CLIPBOARD_MIME } from './clipboardInterop';
import { handleClipboardImagePaste, handleInternalClipboardPaste, handleMarkdownCompatibleHtmlPaste } from './htmlPaste';
import { activeNodeIdFacet, openExternalLinkFacet, openNodeLinkFacet, previewNodeLinkFacet } from './liveMarkdownState';

const previewKeyByView = new WeakMap<EditorView, string>();
const BROWSER_OPEN_MOUSE_BUTTON = 1;

export function handleApplicationCut(event: ClipboardEvent, view: EditorView) {
  if (view.state.readOnly || !view.state.selection.ranges.some((range) => !range.empty)) return false;
  event.preventDefault();
  const clipboard = event.clipboardData;
  const exportPayload = createClipboardExportFromView(view);
  if (!clipboard || !exportPayload) return true;
  try {
    clipboard.setData('text/plain', exportPayload.externalText);
    clipboard.setData('text/html', exportPayload.externalHtml);
    clipboard.setData(
      FOLIOLE_CLIPBOARD_MIME,
      serializeStructuredClipboardPayload({
        anchors: exportPayload.internalAnchors,
        internalText: exportPayload.internalText
      })
    );
  } catch {
    return true;
  }
  view.dispatch(view.state.replaceSelection(''), { userEvent: 'delete.cut' });
  return true;
}

export function createApplicationCutExtensions(enabled: boolean) {
  return enabled ? [EditorView.domEventHandlers({ cut: handleApplicationCut })] : [];
}

function resolveEditorView(currentTarget: EventTarget | null) {
  const editorHost = currentTarget instanceof HTMLElement ? currentTarget : null;
  return editorHost ? EditorView.findFromDOM(editorHost) : null;
}

function resolveElement(target: EventTarget | null) {
  if (!(target instanceof Node)) return null;
  const element = target instanceof HTMLElement ? target : target.parentElement;
  return element instanceof HTMLElement ? element : null;
}

function clearNodeLinkPreview(editorView: EditorView | null) {
  if (!editorView) {
    return;
  }
  const onPreviewNodeLink = editorView.state.facet(previewNodeLinkFacet) ?? null;
  if (!onPreviewNodeLink || !previewKeyByView.has(editorView)) {
    return;
  }
  previewKeyByView.delete(editorView);
  onPreviewNodeLink(null);
}

function buildPreviewRequest(wikiLinkElement: HTMLElement): EditorNodeLinkPreviewRequest | null {
  const title = wikiLinkElement.dataset.mdLinkNodeTitle;
  if (!title) {
    return null;
  }
  const rect = wikiLinkElement.getBoundingClientRect();
  return {
    anchorRect: {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width
    },
    title
  };
}

function buildPreviewKey(request: EditorNodeLinkPreviewRequest) {
  return [
    request.title,
    Math.round(request.anchorRect.left),
    Math.round(request.anchorRect.top),
    Math.round(request.anchorRect.width),
    Math.round(request.anchorRect.height)
  ].join(':');
}

function shouldOpenExternalLinkInBrowser(event: MouseEvent) {
  return event.button === BROWSER_OPEN_MOUSE_BUTTON || event.ctrlKey || event.metaKey;
}

function handleExternalLinkClick(event: MouseEvent) {
  const element = resolveElement(event.target);
  const linkElement = element?.closest('[data-md-link-url]');
  if (!(linkElement instanceof HTMLElement)) return false;

  const href = linkElement.dataset.mdLinkUrl;
  const editorView = resolveEditorView(event.currentTarget);
  const onOpenExternalLink = editorView?.state.facet(openExternalLinkFacet) ?? null;
  if (!href || !onOpenExternalLink) return false;

  event.preventDefault();
  onOpenExternalLink({
    anchorPoint: { x: event.clientX, y: event.clientY },
    href,
    ...(shouldOpenExternalLinkInBrowser(event) ? { target: 'browser' } : {})
  });
  return true;
}

export const markdownInteractionHandlers = EditorView.domEventHandlers({
  auxclick(event) {
    return handleExternalLinkClick(event);
  },
  click(event) {
    const element = resolveElement(event.target);
    if (!(element instanceof HTMLElement)) return false;

    if (element.closest('[data-md-link-url]')) return handleExternalLinkClick(event);

    const wikiLinkElement = element.closest('[data-md-link-node-title]');
    if (!(wikiLinkElement instanceof HTMLElement)) return false;
    const title = wikiLinkElement.dataset.mdLinkNodeTitle;
    const editorView = resolveEditorView(event.currentTarget);
    const onOpenNodeLink = editorView?.state.facet(openNodeLinkFacet) ?? null;
    if (!title || !onOpenNodeLink) return false;

    event.preventDefault();
    clearNodeLinkPreview(editorView);
    onOpenNodeLink(title);
    return true;
  },
  mousemove(event) {
    const editorView = resolveEditorView(event.currentTarget);
    const onPreviewNodeLink = editorView?.state.facet(previewNodeLinkFacet) ?? null;
    if (!editorView || !onPreviewNodeLink) {
      return false;
    }
    const element = resolveElement(event.target);
    const wikiLinkElement = element?.closest('[data-md-link-node-title]');
    if (!(wikiLinkElement instanceof HTMLElement)) {
      clearNodeLinkPreview(editorView);
      return false;
    }
    const request = buildPreviewRequest(wikiLinkElement);
    if (!request) {
      clearNodeLinkPreview(editorView);
      return false;
    }
    const previewKey = buildPreviewKey(request);
    if (previewKeyByView.get(editorView) === previewKey) {
      return false;
    }
    previewKeyByView.set(editorView, previewKey);
    onPreviewNodeLink(request);
    return false;
  },
  mouseleave(event) {
    clearNodeLinkPreview(resolveEditorView(event.currentTarget));
    return false;
  },
  mouseout(event) {
    const currentTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const relatedTarget = event.relatedTarget;
    if (currentTarget && relatedTarget instanceof Node && currentTarget.contains(relatedTarget)) {
      return false;
    }
    clearNodeLinkPreview(resolveEditorView(event.currentTarget));
    return false;
  },
  copy(event, view) {
    const clipboard = event.clipboardData;
    if (!clipboard) return false;

    const exportPayload = createClipboardExportFromView(view);
    if (!exportPayload) return false;

    event.preventDefault();
    clipboard.setData('text/plain', exportPayload.externalText);
    clipboard.setData('text/html', exportPayload.externalHtml);
    clipboard.setData(
      FOLIOLE_CLIPBOARD_MIME,
      serializeStructuredClipboardPayload({
        anchors: exportPayload.internalAnchors,
        internalText: exportPayload.internalText
      })
    );
    return true;
  },
  paste(event, view) {
    if (handleClipboardImagePaste(event.clipboardData, view, view.state.facet(activeNodeIdFacet))) {
      event.preventDefault();
      return true;
    }
    if (handleInternalClipboardPaste(event.clipboardData, view)) {
      event.preventDefault();
      return true;
    }
    if (!handleMarkdownCompatibleHtmlPaste(event.clipboardData, view)) {
      return false;
    }
    event.preventDefault();
    return true;
  }
});
