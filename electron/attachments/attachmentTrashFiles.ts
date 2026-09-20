import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { AttachmentFileEntry } from '../../lib/platform/attachmentMaintenanceContract.js';
import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';

export function attachmentTrashDirectory(assetsDir: string) { return `${assetsDir}.trash`; }

export function inventoryAttachmentDirectory(directory: string): AttachmentFileEntry[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).flatMap((storageKey) => {
    if (!parseCanonicalAttachmentStorageKey(storageKey)) return [];
    const stat = fs.lstatSync(path.join(directory, storageKey));
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('attachment_inventory_unsafe_file');
    return [{ storageKey, sizeBytes: stat.size }];
  });
}

export function moveAttachmentToTrash(assetsDir: string, storageKey: string) {
  moveAttachment(assetsDir, storageKey, true);
}

export function restoreAttachmentFromTrash(assetsDir: string, storageKey: string) {
  moveAttachment(assetsDir, storageKey, false);
}

function moveAttachment(assetsDir: string, storageKey: string, toTrash: boolean) {
  if (!parseCanonicalAttachmentStorageKey(storageKey)) throw new Error('attachment_storage_key_invalid');
  const trash = attachmentTrashDirectory(assetsDir);
  const source = path.join(toTrash ? assetsDir : trash, storageKey);
  const destination = path.join(toTrash ? trash : assetsDir, storageKey);
  if (!fs.existsSync(source)) return;
  assertRegularFile(source);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination)) {
    assertRegularFile(destination);
    const expectedHash = storageKey.slice(0, 64);
    for (const file of [source, destination]) {
      if (createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expectedHash) {
        throw new Error('attachment_trash_destination_conflict');
      }
    }
    fs.unlinkSync(source);
  } else fs.renameSync(source, destination);
}

export function removeTrashedAttachment(assetsDir: string, storageKey: string) {
  if (!parseCanonicalAttachmentStorageKey(storageKey)) throw new Error('attachment_storage_key_invalid');
  const file = path.join(attachmentTrashDirectory(assetsDir), storageKey);
  assertRegularFile(file);
  fs.unlinkSync(file);
}

function assertRegularFile(file: string) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('attachment_file_unsafe');
}
