export interface EditorNodeLinkPreviewRect {
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
