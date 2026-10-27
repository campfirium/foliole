import type { WorkspaceNodeSnapshot } from '../database/workspaceSnapshotHelpers.js';

import type { PushQueuePriority } from './unifiedPushQueueRules.js';

export type SequentialReadingProfile = NonNullable<WorkspaceNodeSnapshot['reading']>;
export type SequentialReadingNode = Pick<WorkspaceNodeSnapshot,
  'id' | 'parentNodeId' | 'kind' | 'title' | 'content' | 'review' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<WorkspaceNodeSnapshot, 'reading' | 'priority' | 'shelvedAt' | 'manualChildOrder' |
    'sequentialReadingEnabled' | 'hasContent' | 'hasReveal' | 'reveal'>> & {
      specialKind?: string;
      anchorLink?: { kind: 'highlight' | 'cloze' | 'image-excerpt' } | null;
    };
export type SequentialReadingNodes = Record<string, SequentialReadingNode>;

export interface SequentialReadingChange {
  afterReading: SequentialReadingProfile | null;
  beforeReading: SequentialReadingProfile | null;
  nodeId: string;
}

export interface SequentialReadingArgs<T extends SequentialReadingNode = SequentialReadingNode> {
  defaultPriority: PushQueuePriority;
  nodeOrder: string[];
  nodesById: Record<string, T>;
  now: string;
}

export interface SequentialReadingPatch<T extends SequentialReadingNode> {
  changes: SequentialReadingChange[];
  nodesById: Record<string, T>;
  sourceNodeId: string;
}
