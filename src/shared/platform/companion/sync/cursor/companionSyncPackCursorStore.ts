export interface CompanionSyncPackCursorStore {
  loadCursor(): Promise<number | null>;
  loadRestoreCursor?(restoreId: string): Promise<number>;
  loadRestorePosition?(restoreId: string): Promise<{
    cursor: number; frontierStateSeq?: number; sourceEpoch?: string
  }>;
  saveCursor(cursor: number | null): Promise<number | null>;
}
