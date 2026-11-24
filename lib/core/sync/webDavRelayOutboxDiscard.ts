import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import { webDavRelayAttachmentOutboxKey } from './webDavRelayAttachments.js';
import { webDavRelayBodyOutboxKey, webDavRelayPacketDirectory } from './webDavRelayBodyOutbox.js';
import type { WebDavRelayBodyScope } from './webDavRelayBodyScope.js';
import { webDavRelayRepairOutboxKey, webDavRelayRepairPacketDirectory } from './webDavRelayRepairOutbox.js';

type Input = {
  host: RequestSyncDatabaseHost;
  files: FramedSyncFilePort;
  scope: WebDavRelayBodyScope;
  signal?: AbortSignal;
  assertScope(): Promise<void>;
};

export async function discardRetiredWebDavRelayPackets({ host, files, scope, signal, assertScope }: Input) {
  const body = webDavRelayBodyOutboxKey(scope);
  const attachment = webDavRelayAttachmentOutboxKey(scope);
  const repair = webDavRelayRepairOutboxKey(scope);
  const rows = await host.readSnapshot(db => db.query<{ key: string }>(`SELECT key FROM sync_group_metadata
    WHERE key IN (?, ?, ?) AND CASE WHEN json_valid(value)
      THEN json_extract(value, CASE WHEN key = ? THEN '$.name' ELSE '$.packet.name' END) GLOB '*.bin' END`,
  [body, attachment, repair, attachment]), signal);
  if (!rows.length) return;
  const retired = new Set(rows.map(row => row.key));

  // Keep the discard markers until the staged files are gone so an interrupted cleanup can retry.
  await assertScope();
  if (retired.has(body) || retired.has(attachment)) await files.remove(webDavRelayPacketDirectory(scope));
  if (retired.has(repair)) await files.remove(webDavRelayRepairPacketDirectory(scope));

  // Keep the body cursor, the attachment queue entries, and the live repair demand.
  await host.write(db => db.transaction(async tx => {
    if (retired.has(body)) await tx.run("UPDATE sync_group_metadata SET value = json_set(value, '$.packet', NULL) WHERE key = ?", [body]);
    if (retired.has(attachment)) await tx.run('DELETE FROM sync_group_metadata WHERE key = ?', [attachment]);
    if (retired.has(repair)) await tx.run("UPDATE sync_group_metadata SET value = json_remove(value, '$.packet') WHERE key = ?", [repair]);
  }));
}
