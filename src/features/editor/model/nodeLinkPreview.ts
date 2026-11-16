export const NODE_LINK_PREVIEW_SELECTOR = '[data-node-link-preview]';

interface EditorNodeLinkPreviewRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

export interface EditorNodeLinkPreviewRequest {
  anchorRect: EditorNodeLinkPreviewRect;
  title: string;
}
