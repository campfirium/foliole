import type { LocalContentEdit } from '../../../../../lib/core/sync/localContentEdit';
import type { ContentImageReference } from '../../../../../lib/core/sync/localContentEditResources';

export interface CompanionContentSource {
  reveal?: string | null;
  content: string;
  imageReferences?: ContentImageReference[];
  versionId: string;
}

export interface CompanionContentEdit extends LocalContentEdit {
  historyTransactions?: readonly import('./contentDraftHistory').ContentHistoryTransactions[];
  content: string;
  holdId?: string;
  nodeId: string;
  updatedAt: string;
}

export interface CompanionContentAcknowledgement {
  reveal?: string | null;
  content: string;
  currentVersionId: string;
  submittedVersionId: string;
}

export interface CompanionContentSaveHandler {
  historySource?: (editorNodeId: string | null, field: 'content' | 'reveal') => ReturnType<import('../../../../features/editor/adapters/EditorAdapter').EditorTextHistorySource>;
  (nodeId: string, content: string, edit?: CompanionContentEdit): Promise<CompanionContentAcknowledgement>;
  readSource(nodeId: string, holdId?: string): Promise<CompanionContentSource>;
  retainHold?(nodeId: string, versionId: string, holdId: string): Promise<void>;
  releaseHold?(nodeId: string, holdId: string): Promise<void>;
}
