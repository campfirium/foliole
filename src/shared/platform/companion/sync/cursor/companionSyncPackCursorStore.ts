export interface CompanionSyncPackCursorStore {
  loadCursor(): Promise<number | null>;
  saveCursor(cursor: number | null): Promise<number | null>;
}
