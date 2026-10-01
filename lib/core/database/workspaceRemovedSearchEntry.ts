export interface WorkspaceRemovedSearchEntry {
  content: string | null;
  contentPreview: string | null;
  deletedAt: string;
  firstSeenAt: string;
  hasSourceUpdate: boolean;
  id: string;
  lastImportedAt: string | null;
  lastNodeId: string | null;
  ruleId: string;
  sourcePath: string;
  title: string;
}
