import type { CompanionFolderBackupPort } from '../../../../../lib/platform/companionFolderBackupContract';

/** Register only the owner's identity. Native backup reads use the same engine
 * independently of the interactive snapshot lease and renderer writer queue. */
export class CompanionFolderBackupSource {
  private session: { epoch: string; path: string; port: CompanionFolderBackupPort; ready: Promise<void> } | null = null;
  private closing = false;

  async acquire(path: string, port: CompanionFolderBackupPort): Promise<string> {
    if (this.closing) throw new Error('folder_backup_source_closed');
    if (!this.session) {
      const epoch = crypto.randomUUID();
      this.session = { epoch, path, port, ready: port.openSource({ sourceEpoch: epoch, databasePath: path }) };
    }
    const session = this.session;
    if (session.path !== path || session.port !== port) throw new Error('folder_backup_source_changed');
    await session.ready;
    if (this.closing) throw new Error('folder_backup_source_closed');
    return session.epoch;
  }

  async close() {
    this.closing = true;
    const session = this.session;
    if (!session) return;
    // Cleanup still revokes a partially registered source after a failed open.
    await session.ready.catch(() => undefined);
    await session.port.closeSource({ sourceEpoch: session.epoch });
  }
}
