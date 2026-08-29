export interface NativeWorkspaceAnchorLink {
  id: string;
  kind: 'highlight' | 'cloze' | 'image-excerpt';
  locator?: {
    attachmentId?: string;
    from?: number;
    height?: number;
    originalText?: string;
    page?: number;
    rects?: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
    to?: number;
    width?: number;
    x: number;
    y: number;
  } | {
    display: 'block' | 'inline';
    fallbackRect: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    formulaSource: string;
    kind: 'formula-region';
    occurrenceKey: string;
    selection: {
      algorithm: 'katex-dom-leaf-v1';
      fallbackRect: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      leaves: Array<{
        path: number[];
        structureFingerprint: string;
        textFingerprint: string;
      }>;
    };
  } | {
    ranges: Array<{
      from: number;
      originalText: string;
      to: number;
    }>;
  } | {
    from: number;
    originalText: string;
    to: number;
  };
}

export interface NativeWorkspaceImageRegion {
  id: string;
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface NativeWorkspaceImageRegionGroup {
  attachmentId: string;
  regions: NativeWorkspaceImageRegion[];
}
