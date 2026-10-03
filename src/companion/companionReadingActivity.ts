import { CompanionSelectionRefreshError } from './companionSelectionRefreshError';

export class CompanionReadingActivity {
  editing = false;
  flushDraft: (() => Promise<void>) | null = null;
  private pending = new Set<Promise<unknown>>();
  private errors = new Map<string, unknown>();

  constructor(readonly nodeId: string | null, readonly changed: () => void) {}

  setEditing = (editing: boolean) => {
    this.editing = editing;
    this.changed();
  };

  async run<T>(key: string, action: () => Promise<T>): Promise<T> {
    this.errors.delete(key);
    const task = action();
    this.pending.add(task);
    try {
      return await task;
    } catch (error) {
      this.errors.set(key, error);
      if (error instanceof CompanionSelectionRefreshError) {
        throw new CompanionSelectionRefreshError(() => this.run(key, error.retryRefresh));
      }
      throw error;
    } finally {
      this.pending.delete(task);
    }
  }

  async flush(retryingKey?: string) {
    await Promise.all([...this.pending]);
    for (const [key, error] of this.errors) if (key !== retryingKey) throw error;
    await this.flushDraft?.();
  }
}
