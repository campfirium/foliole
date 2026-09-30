import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { openDatabaseConnection } from '../database/connection.js';
export async function writeAttachmentFixture(sourceDir: string, bytes: number) {
  const staged = path.join(sourceDir, 'fixture.preparing');
  const digest = createHash('sha256');
  const file = await fs.open(staged, 'w');
  try {
    const prefix = Buffer.from('89504e470d0a1a0a', 'hex');
    await file.writeFile(prefix);
    digest.update(prefix);
    let remaining = bytes - prefix.length;
    const chunk = Buffer.alloc(1024 * 1024, 0x53);
    while (remaining > 0) {
      const part = chunk.subarray(0, Math.min(chunk.length, remaining));
      await file.writeFile(part);
      digest.update(part);
      remaining -= part.length;
    }
    await file.sync();
  } finally { await file.close(); }
  const hash = digest.digest('hex');
  const sourcePath = path.join(sourceDir, `${hash}.png`);
  await fs.rename(staged, sourcePath);
  return { hash, sourcePath };
}

export function seedGroup() {
  const driver = openDatabaseConnection().driver;
  driver.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  driver.execute("INSERT INTO sync_group_local_state VALUES (1, 'group', 'source', 'active', 'now')");
  for (const id of ['source', 'receiver']) driver.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
     platform, state, joined_at, updated_at) VALUES ('group', ?, ?, '/source', ?, 'mac', 'active', 'now', 'now')`,
  [id, id, id]);
  return driver;
}
