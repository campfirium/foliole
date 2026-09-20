import type { LocalContentEdit } from '../../../../../lib/core/sync/localContentEdit';

export interface CompanionContentSource {
  content: string;
  versionId: string;
}

export interface CompanionContentEdit extends LocalContentEdit {
  content: string;
  nodeId: string;
  updatedAt: string;
}

export interface CompanionContentAcknowledgement {
  content: string;
  currentVersionId: string;
  submittedVersionId: string;
}

export interface CompanionContentSaveHandler {
  (nodeId: string, content: string, edit?: CompanionContentEdit): Promise<CompanionContentAcknowledgement>;
  readSource(nodeId: string): Promise<CompanionContentSource>;
}
