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

export interface NodeAnchorLink {
  id: string;
  kind: 'highlight' | 'cloze';
}

export interface Node {
  id: string;
  parentNodeId: string | null;
  title: string;
  isTitleManual?: boolean;
  content: string;
  anchorLink?: NodeAnchorLink | null;
  reveal: string | null;
  review: NodeReviewProfile | null;
  createdAt: string;
  updatedAt: string;
}
