import type { DatabaseRow } from '../../lib/core/database/driver.js';

export interface RecoveryCandidate {
  documentId: string;
  highlightIds: string[];
  status: string;
}

export interface RecoveryArtifact {
  documentIds: Set<string>;
  highlightIds: string[];
  nodeId: string;
  raw: string;
  sourceFingerprint: string | null;
}

export interface RecoveryWrongSourceRow extends DatabaseRow {
  latest_node_id: string;
  remote_document_id: string;
  source_fingerprint: string;
}

export interface RecoveryClassification {
  nodeId: string | null;
  remoteId: string;
  status: 'bound' | 'suppressed';
}

export interface RecoveryBinding extends RecoveryClassification {
  annotations: RecoveryClassification[];
  targetSourceFingerprint: string | null;
  wrongRootNodeId: string | null;
  wrongSourceFingerprint: string | null;
}

export interface ReadwiseCutoverRecoveryPlan {
  attachmentFileHash: string;
  attachmentIds: string[];
  attachmentRelations: Array<{ attachmentId: string; nodeId: string; role: string }>;
  bindings: RecoveryBinding[];
  cohortDocumentIds: string[];
  connectionRef: string;
  databasePath: string;
  generatedAt: string;
  importSourceHash: string;
  manifestHash: string;
  originalNodeHash: string;
  sourceHost: string;
  startedAt: string;
  unrelatedNodeHash: string;
  version: 1;
  wrongNodeHash: string;
  wrongNodeIds: string[];
}
