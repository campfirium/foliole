import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { inspectAndroidAttachmentArchive } from '../android/android-attachment-archive-evidence.mjs';

import { readVerifiedAttachmentIds } from './attachment-file-evidence.mjs';

it('counts actual verified files and rejects corrupt names for directory and Android archive evidence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-attachment-evidence-'));
  try {
    const assets = path.join(root, 'files', 'attachments');
    fs.mkdirSync(assets, { recursive: true });
    const body = Buffer.from('fixture attachment');
    const hash = createHash('sha256').update(body).digest('hex');
    fs.writeFileSync(path.join(assets, `${hash}.png`), body);
    fs.writeFileSync(path.join(assets, `${'b'.repeat(64)}.png`), 'corrupt');
    fs.writeFileSync(path.join(assets, 'unrelated.txt'), 'ignore');
    expect(readVerifiedAttachmentIds(assets)).toEqual([hash]);
    const archive = path.join(root, 'attachments.tar');
    execFileSync('tar', ['-cf', archive, '-C', root, 'files/attachments']);
    await expect(inspectAndroidAttachmentArchive(archive)).resolves.toEqual([
      { contentHash: hash, sizeBytes: body.length, storageKey: `${hash}.png` }
    ]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
