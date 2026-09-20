import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function readVerifiedAttachmentIds(assetsDir) {
  if (!fs.existsSync(assetsDir)) return [];
  return fs.readdirSync(assetsDir).flatMap((name) => {
    if (!/^[a-f0-9]{64}\.(png|jpg|gif|webp|pdf|epub)$/u.test(name)) return [];
    const file = path.join(assetsDir, name);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) return [];
    const hash = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    return name.startsWith(`${hash}.`) ? [hash] : [];
  });
}
