import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';

/** Only inspect names supplied by the historical registry; never replace existing bytes. */
export function prepareLegacyAttachmentFiles(assetsDir: string, targets: ReadonlyMap<string, string>) {
  const aliasesByKey = new Map<string, string[]>();
  for (const [alias, key] of targets) aliasesByKey.set(key, [...(aliasesByKey.get(key) ?? []), alias]);
  for (const [key, aliases] of aliasesByKey) {
    const canonicalPath = path.join(assetsDir, key);
    const hash = parseCanonicalAttachmentStorageKey(key)!.contentHash;
    if (fs.existsSync(canonicalPath)) {
      verifyFile(canonicalPath, hash);
      continue;
    }
    const sources = aliases.filter((alias) => path.basename(alias) === alias)
      .map((alias) => path.join(assetsDir, alias)).filter((file) => fs.existsSync(file));
    if (!sources.length) continue;
    for (const source of sources) verifyFile(source, hash);
    fs.copyFileSync(sources[0]!, canonicalPath, fs.constants.COPYFILE_EXCL);
    verifyFile(canonicalPath, hash);
  }
}

function verifyFile(file: string, hash: string) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== hash) {
    throw new Error('legacy_attachment_file_identity_mismatch');
  }
}
