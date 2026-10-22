export interface DatabaseUpgradeWorkerInput {
  assetsDir: string;
  dbPath: string;
  hostName: string;
  /** A restore candidate sits at a temporary path, so it skips repairs bound to the library location. */
  scope: 'library' | 'restore-candidate';
  snapshotPath: string | null;
}

export interface DatabaseUpgradeProgress {
  from: number;
  to: number;
  version: number;
}

export type DatabaseUpgradeWorkerMessage =
  | ({ type: 'progress' } & DatabaseUpgradeProgress)
  | { type: 'result'; ok: true; previousVersion: number }
  | { type: 'result'; ok: false; message: string };
