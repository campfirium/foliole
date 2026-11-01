import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';

export const digest = value => createHash('sha256').update(value).digest('hex');
export function securityInputIdentity(root, trackedFiles) {
  const required = ['package.json', 'package-lock.json', '.npmrc'];
  const files = [...new Set([...required, ...trackedFiles.filter(file =>
    file.startsWith('android/') || file.startsWith('ios/') || file.startsWith('.github/workflows/')
      || file === 'capacitor.config.ts')])].sort();
  const hashes = Object.fromEntries(files.map(file => [file, digest(readFileSync(path.join(root, file)))]));
  return { files: hashes, inputDigest: digest(JSON.stringify(hashes)) };
}

export function workflowReferences(root) {
  const references = [];
  const errors = [];
  const directory = path.join(root, '.github/workflows');
  for (const file of readdirSync(directory).filter(name => /\.ya?ml$/u.test(name)).sort()) {
    try {
      const document = parseDocument(readFileSync(path.join(directory, file), 'utf8'));
      if (document.errors.length) throw new Error(document.errors.map(error => error.message).join('; '));
      function visit(value, location) {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          if (key === 'uses') {
            references.push({ file, location, reference: child,
              status: typeof child !== 'string' || child.includes('${{') ? 'unsupported'
                : child.startsWith('./') ? 'local-workflow' : 'requires-upstream-review' });
          } else visit(child, `${location}.${key}`);
        }
      }
      visit(document.toJS(), '$');
    } catch (error) { errors.push({ file, reason: error.message }); }
  }
  return { references, errors };
}

export function captureSecurityCandidate(root, git) {
  const identity = securityInputIdentity(root, git(['ls-files']).trim().split('\n'));
  const worktreeDirty = Boolean(git(['status', '--porcelain']).trim());
  return { revision: git(['rev-parse', 'HEAD']).trim(), inputDigest: identity.inputDigest,
    mode: worktreeDirty ? 'working-tree' : 'committed', worktreeDirty };
}

export function sameSecurityCandidate(before, after) {
  return before.revision === after.revision && before.inputDigest === after.inputDigest;
}
