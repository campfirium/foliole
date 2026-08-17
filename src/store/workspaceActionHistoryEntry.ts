import type { WorkspaceDeleteHistoryEntry } from './workspaceDeleteHistoryEntry';
import type { WorkspaceReviewGradeHistoryEntry } from './workspaceReviewGradeActionHistory';
import type { WorkspaceTopicShelveHistoryEntry } from './workspaceShelveActionHistory';
import type { WorkspaceStructureHistoryEntry } from './workspaceStructureHistoryTypes';
import type { WorkspaceTopicDismissHistoryEntry } from './workspaceTopicDismissActionHistory';

export type WorkspaceActionHistoryEntry =
  | WorkspaceDeleteHistoryEntry
  | WorkspaceReviewGradeHistoryEntry
  | WorkspaceStructureHistoryEntry
  | WorkspaceTopicDismissHistoryEntry
  | WorkspaceTopicShelveHistoryEntry;

export function createWorkspaceActionHistoryEntryId() {
  return `workspace-history-${crypto.randomUUID()}`;
}
