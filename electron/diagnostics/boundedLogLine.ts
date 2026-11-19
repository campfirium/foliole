import { promises as fs } from 'node:fs';

async function readLogSize(filePath: string) {
  try {
    const stat = await fs.lstat(filePath);
    if (!stat.isFile()) throw new Error('Invalid diagnostic log file');
    return stat.size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

async function readCompleteLogTail(filePath: string, size: number, budget: number) {
  if (budget === 0) return Buffer.alloc(0);
  const offset = Math.max(0, size - budget - 1);
  const tail = Buffer.alloc(size - offset);
  const handle = await fs.open(filePath, 'r');
  try {
    const { bytesRead } = await handle.read(tail, 0, tail.length, offset);
    if (bytesRead !== tail.length) throw new Error('Could not read the complete diagnostic log tail');
  } finally {
    await handle.close();
  }
  const first = size > budget ? tail.indexOf(0x0a) : -1;
  return tail.subarray(first + 1, tail.lastIndexOf(0x0a) + 1);
}

export async function appendBoundedLogLine(filePath: string, line: Buffer, maxBytes: number) {
  if (line.length > maxBytes) return;
  const size = await readLogSize(filePath);
  if (size + line.length <= maxBytes) {
    await fs.appendFile(filePath, line, { mode: 0o600 });
    return;
  }

  const budget = Math.min(maxBytes / 2, maxBytes - line.length);
  const recent = await readCompleteLogTail(filePath, size, budget);
  const pendingPath = `${filePath}.tmp`;
  await fs.rm(pendingPath, { force: true });
  try {
    await fs.writeFile(pendingPath, Buffer.concat([recent, line]), { flag: 'wx', mode: 0o600 });
    await fs.rename(pendingPath, filePath);
  } finally {
    await fs.rm(pendingPath, { force: true });
  }
}
