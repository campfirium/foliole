export interface NativeWorkspaceAnchorLink {
  id: string;
  kind: 'highlight' | 'cloze';
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
