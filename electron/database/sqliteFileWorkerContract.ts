export type SqliteFileWork =
  // A live library is opened read-write so its committed WAL pages are part of the copy.
  | { destinationPath: string; live: boolean; operation: 'backup'; sourcePath: string }
  | { operation: 'quick_check'; sourcePath: string };

export type SqliteFileWorkerMessage =
  | { message: string; ok: false }
  | { ok: true; remainingPages: number; totalPages: number }
  | { ok: true; result: string };
