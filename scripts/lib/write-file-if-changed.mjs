import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeFileIfChanged(filePath, content) {
  try {
    if (await fs.readFile(filePath, 'utf8') === content) return false;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
  return true;
}
