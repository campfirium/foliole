import { EditorView } from '@codemirror/view';

import { serializeStructuredClipboardPayload } from '../model/anchorClipboardPayload';

import { createClipboardExportFromView, FOLIOLE_CLIPBOARD_MIME } from './clipboardInterop';
import { handleClipboardImagePaste, handleInternalClipboardPaste, handleMarkdownCompatibleHtmlPaste } from './htmlPaste';
import { activeNodeIdFacet, openExternalLinkFacet, openNodeLinkFacet } from './liveMarkdownState';

export const markdownInteractionHandlers = EditorView.domEventHandlers({
  click(event) {
    const target = event.target;
    if (!(target instanceof Node)) return false;
    const element = target instanceof HTMLElement ? target : target.parentElement;
    if (!(element instanceof HTMLElement)) return false;

    const linkElement = element.closest('[data-md-link-url]');
    if (linkElement instanceof HTMLElement) {
      const href = linkElement.dataset.mdLinkUrl;
      const editorHost = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
      const editorView = editorHost ? EditorView.findFromDOM(editorHost) : null;
      const onOpenExternalLink = editorView?.state.facet(openExternalLinkFacet) ?? null;
      if (!href) return false;
      if (!onOpenExternalLink) return false;
      event.preventDefault();
      onOpenExternalLink({
        anchorPoint: { x: event.clientX, y: event.clientY },
        href
      });
      return true;
    }

    const wikiLinkElement = element.closest('[data-md-link-node-title]');
    if (!(wikiLinkElement instanceof HTMLElement)) return false;
    const title = wikiLinkElement.dataset.mdLinkNodeTitle;
    const editorHost = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const editorView = editorHost ? EditorView.findFromDOM(editorHost) : null;
    const onOpenNodeLink = editorView?.state.facet(openNodeLinkFacet) ?? null;
    if (!title || !onOpenNodeLink) return false;

    event.preventDefault();
    onOpenNodeLink(title);
    return true;
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
