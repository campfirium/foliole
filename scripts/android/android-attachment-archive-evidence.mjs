import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export async function inspectAndroidAttachmentArchive(archivePath) {
  const { stdout } = await execute('tar', ['-tf', archivePath], { encoding: 'utf8' });
  const names = stdout.split(/\r?\n/u).filter((name) => /^files\/attachments\/[a-f0-9]{64}\.(png|jpg|gif|webp|pdf|epub)$/u.test(name));
  const files = [];
  for (const name of names) {
    const { stdout: bytes } = await execute('tar', ['-xOf', archivePath, name],
      { encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024 });
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    const storageKey = name.slice('files/attachments/'.length);
    if (bytes.length > 0 && storageKey.startsWith(`${contentHash}.`)) files.push({ contentHash, sizeBytes: bytes.length, storageKey });
  }
  return files;
}
