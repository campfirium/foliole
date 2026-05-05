export interface NativeReadwiseDetectionSample {
  excerpt: string;
  highlightText: string;
  matched: boolean;
  sourceName: string;
}

export interface NativeReadwiseDetectionResult {
  checkedSourceCount: number;
  detectedHighlightCount: number;
  matchedHighlightCount: number;
  message: string;
  sampleCount: number;
  samples: NativeReadwiseDetectionSample[];
  success: boolean;
}
