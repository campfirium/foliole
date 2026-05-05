export interface NodeReviewProfile {
  due: string;
  lastReviewAt: string | null;
  state: 0 | 1 | 2 | 3;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
}

export interface NodeReadingProfile {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: string;
  nextAt: string;
  priority: number;
  readingPosition: number;
  repetitionCount: number;
  state: 'active' | 'done' | 'dismissed';
}

export interface NodeAnchorLink {
  id: string;
  kind: 'highlight' | 'cloze';
}

export interface Node {
  id: string;
  parentNodeId: string | null;
  priority?: number | null;
  desiredRetention?: number | null;
  title: string;
  isTitleManual?: boolean;
  content: string;
  anchorLink?: NodeAnchorLink | null;
  reveal: string | null;
  reading?: NodeReadingProfile | null;
  review: NodeReviewProfile | null;
  createdAt: string;
  updatedAt: string;
}
