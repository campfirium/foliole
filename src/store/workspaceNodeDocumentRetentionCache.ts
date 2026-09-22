import type { WorkspaceNodeDocument } from './workspaceRendererBoundaryDocument';

interface CachedDocumentEntry {
  document: WorkspaceNodeDocument;
  size: number;
}

export class WorkspaceNodeDocumentRetentionCache {
  private readonly entries = new Map<string, CachedDocumentEntry>();
  private pinnedSizes = new Map<string, number>();

  constructor(
    private readonly maxEntries: number,
    private readonly maxEntryBytes: number,
    private readonly maxTotalBytes: number,
    private readonly measure: (document: WorkspaceNodeDocument) => number
  ) {}

  get(nodeId: string) {
    const entry = this.entries.get(nodeId);
    if (!entry) return undefined;
    this.entries.delete(nodeId);
    this.entries.set(nodeId, entry);
    return entry.document;
  }

  set(nodeId: string, document: WorkspaceNodeDocument) {
    const size = this.measure(document);
    this.entries.delete(nodeId);
    if (size > this.maxEntryBytes) {
      this.trim();
      return false;
    }
    this.entries.set(nodeId, { document, size });
    this.trim();
    return this.entries.has(nodeId);
  }

  setPinnedDocuments(documents: ReadonlyMap<string, WorkspaceNodeDocument>) {
    const previousPinnedIds = new Set(this.pinnedSizes.keys());
    this.pinnedSizes = new Map(
      Array.from(documents, ([nodeId, document]) => [nodeId, this.measure(document)])
    );
    for (const nodeId of previousPinnedIds) {
      if (!this.pinnedSizes.has(nodeId)) this.touch(nodeId);
    }
    this.trim();
  }

  delete(nodeId: string) {
    return this.entries.delete(nodeId);
  }

  clear() {
    this.entries.clear();
    this.pinnedSizes.clear();
  }

  private touch(nodeId: string) {
    const entry = this.entries.get(nodeId);
    if (!entry) return;
    this.entries.delete(nodeId);
    this.entries.set(nodeId, entry);
  }

  private logicalUsage() {
    let count = this.pinnedSizes.size;
    let size = Array.from(this.pinnedSizes.values()).reduce((total, value) => total + value, 0);
    for (const [nodeId, entry] of this.entries) {
      if (this.pinnedSizes.has(nodeId)) continue;
      count += 1;
      size += entry.size;
    }
    return { count, size };
  }

  private trim() {
    let usage = this.logicalUsage();
    while (usage.count > this.maxEntries || usage.size > this.maxTotalBytes) {
      const oldestEvictable = Array.from(this.entries.keys()).find(
        (nodeId) => !this.pinnedSizes.has(nodeId)
      );
      if (!oldestEvictable) return;
      this.entries.delete(oldestEvictable);
      usage = this.logicalUsage();
    }
  }
}
