import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export async function hashResourceFile(filePath: string) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest('hex');
}
