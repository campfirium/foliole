import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { attachmentTrashDirectory, inventoryAttachmentDirectory, moveAttachmentToTrash,
  removeTrashedAttachment, restoreAttachmentFromTrash } from './attachmentTrashFiles.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-trash-'));
  roots.push(root);
  const assets = path.join(root, 'assets');
  fs.mkdirSync(assets);
  const bytes = Buffer.from('recoverable attachment');
  const key = `${createHash('sha256').update(bytes).digest('hex')}.png`;
  fs.writeFileSync(path.join(assets, key), bytes);
  return { assets, bytes, key, trash: attachmentTrashDirectory(assets) };
}

it('moves recoverable bytes to trash, restores them, and deletes only on explicit empty', () => {
  const f = fixture();
  moveAttachmentToTrash(f.assets, f.key);
  expect(inventoryAttachmentDirectory(f.assets)).toEqual([]);
  expect(fs.readFileSync(path.join(f.trash, f.key))).toEqual(f.bytes);
  restoreAttachmentFromTrash(f.assets, f.key);
  expect(fs.readFileSync(path.join(f.assets, f.key))).toEqual(f.bytes);
  moveAttachmentToTrash(f.assets, f.key);
  removeTrashedAttachment(f.assets, f.key);
  expect(inventoryAttachmentDirectory(f.trash)).toEqual([]);
});

it('retains the source when a destination conflicts or is a symbolic link', () => {
  const f = fixture();
  fs.mkdirSync(f.trash);
  const target = path.join(f.trash, f.key);
  fs.writeFileSync(target, 'different bytes');
  expect(() => moveAttachmentToTrash(f.assets, f.key)).toThrow('conflict');
  expect(fs.readFileSync(path.join(f.assets, f.key))).toEqual(f.bytes);
  fs.unlinkSync(target);
  fs.symlinkSync(path.join(f.assets, f.key), target);
  expect(() => moveAttachmentToTrash(f.assets, f.key)).toThrow('unsafe');
  expect(fs.readFileSync(path.join(f.assets, f.key))).toEqual(f.bytes);
});

it('deduplicates identical copies without losing recoverable bytes and refuses path traversal', () => {
  const f = fixture();
  fs.mkdirSync(f.trash);
  fs.writeFileSync(path.join(f.trash, f.key), f.bytes);
  moveAttachmentToTrash(f.assets, f.key);
  expect(fs.readFileSync(path.join(f.trash, f.key))).toEqual(f.bytes);
  expect(() => restoreAttachmentFromTrash(f.assets, '../other.png')).toThrow('invalid');
});
