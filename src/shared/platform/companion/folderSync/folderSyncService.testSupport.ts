import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { FolderSyncLocation, FolderSyncNativePlugin, FolderSyncFileOperation } from '../../../../../lib/platform/nativeFolderSyncContract.js';

/** Test host boundary: real target files and durable state, simulated system picker/URI permission. */
export function folderNativeFixture(root: string) {
  const statePath = path.join(root, 'location.json');
  let authorized = true;
  let lease: string | null = null;
  let cancel = false;
  let failWrite = false;
  let leaseSequence = 0;
  const read = async (): Promise<FolderSyncLocation | null> => {
    try { return { ...JSON.parse(await fs.readFile(statePath, 'utf8')), authorized }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  };
  const verify = async (token: string, value: string, permission = true) => {
    if (value !== lease || token !== (await read())?.token || permission && !authorized) throw new Error('folder_sync_authorization_required');
  };
  const plugin: FolderSyncNativePlugin = {
    readLocation: async () => ({ location: await read() }),
    async chooseLocation() {
      if (cancel) return { cancelled: true, location: await read() };
      const location: FolderSyncLocation = { token: 'tree-token', name: 'Documents', authorized, completion: null };
      await fs.writeFile(statePath, JSON.stringify(location));
      return { cancelled: false, location };
    },
    async acquire({ token }) {
      if (lease) throw new Error('folder_sync_busy');
      if (!authorized || token !== (await read())?.token) throw new Error('folder_sync_authorization_required');
      lease = `lease-${++leaseSequence}`;
      return { lease };
    },
    async release(input) { await verify(input.token, input.lease, false); lease = null; },
    async saveCompletion(input) {
      await verify(input.token, input.lease);
      await fs.writeFile(statePath, JSON.stringify({ ...(await read()), completion: input.completion }));
    },
    async access(input) {
      await verify(input.token, input.lease);
      if (failWrite && input.operation === 'write') throw new Error('space_unavailable');
      return accessDisk(root, input);
    }
  };
  return { plugin, read, revoke: () => { authorized = false; }, grant: () => { authorized = true; },
    cancel: () => { cancel = true; }, fail: (value: boolean) => { failWrite = value; }, hasLease: () => lease !== null };
}

function filename(root: string, key: string) {
  if (!/^(folder-sync|attachments)\/[a-z0-9./_-]+$/u.test(key) || key.includes('..')) throw new Error('path_invalid');
  return path.join(root, 'destination', key);
}

async function accessDisk(root: string, input: FolderSyncFileOperation) {
      const file = filename(root, input.key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const bytes = async () => {
        try { return await fs.readFile(file); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
      };
      switch (input.operation) {
        case 'read': return { base64: (await bytes())?.toString('base64') ?? null };
        case 'write':
          await fs.writeFile(file, Buffer.from(input.base64, 'base64')); return {};
        case 'stat': {
          const content = await bytes();
          return { present: Boolean(content), length: content?.length ?? 0,
            hash: content ? createHash('sha256').update(content).digest('hex') : '' };
        }
        case 'length': return { length: (await bytes())?.length ?? 0 };
        case 'truncate': {
          const handle = await fs.open(file, 'a');
          try { await handle.truncate(input.length); } finally { await handle.close(); }
          return {};
        }
        case 'append':
          if ((await bytes())?.length !== input.offset) throw new Error('partial_length_changed');
          await fs.appendFile(file, Buffer.from(input.base64, 'base64')); return {};
        case 'remove': await fs.rm(file, { force: true }); return {};
        case 'publish': {
          const hash = input.key.split('/')[1]!.slice(0, 64);
          await fs.copyFile(filename(root, `attachments/partial-${hash}`), file);
          return {};
        }
      }
}
