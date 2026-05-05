export interface NodeReviewProfile {
  due: string;
  lastReviewAt: string | null;
  state: number;
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
  content: string;
  anchorLink?: NodeAnchorLink | null;
  reveal: string | null;
  review: NodeReviewProfile | null;
  createdAt: string;
  updatedAt: string;
}
