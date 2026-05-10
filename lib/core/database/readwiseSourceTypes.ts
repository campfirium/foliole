export type ReadwiseSourceState = 'external' | 'internal';
export type ReadwiseSourceSyncStatus = 'idle' | 'syncing' | 'synced' | 'failed' | 'rate_limited';

export interface ReadwiseSourceAnnotation {
  annotationKind?: 'highlight' | 'note';
  deletedAt?: string | null;
  highlightId: string;
  location?: string | null;
  note?: string | null;
  parentId?: string | null;
  readwiseBookId?: string | null;
  remoteUpdatedAt?: string | null;
  text?: string | null;
}

export interface ReadwiseSourceInput {
  accountId?: string;
  annotations?: ReadwiseSourceAnnotation[];
  author?: string | null;
  category?: string | null;
  internalNodeId?: string | null;
  location?: string | null;
  promotionLock?: boolean;
  rawSourceUrl?: string | null;
  rawSourceUrlStatus?: string;
  readerDocumentId: string;
  readwiseBookId?: string | null;
  remoteUpdatedAt?: string | null;
  sourceState?: ReadwiseSourceState;
  sourceUrl?: string | null;
  syncCursor?: string | null;
  syncStatus?: ReadwiseSourceSyncStatus;
  tags?: string[];
  title?: string;
  updatedAt: string;
}

export interface ReadwiseSourceRecord extends Required<Omit<ReadwiseSourceInput,
  'accountId' | 'annotations' | 'author' | 'category' | 'internalNodeId' | 'location' | 'rawSourceUrl' |
  'readwiseBookId' | 'remoteUpdatedAt' | 'sourceUrl' | 'syncCursor' | 'tags'>> {
  accountId: string;
  annotations: ReadwiseSourceAnnotation[];
  author: string | null;
  category: string | null;
  createdAt: string;
  internalNodeId: string | null;
  location: string | null;
  rawSourceUrl: string | null;
  readwiseBookId: string | null;
  remoteUpdatedAt: string | null;
  sourceId: string;
  sourceUrl: string | null;
  syncCursor: string | null;
  tags: string[];
}
