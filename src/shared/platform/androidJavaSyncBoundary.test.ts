import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { expect, it } from 'vitest';

const ROOT = process.cwd();
const ANDROID_MAIN_JAVA = 'android/app/src/main/java/com/foliole/android';
const FORBIDDEN_MAIN_PATTERNS = [
  /\bclass\s+FolioleCompanionSyncPackApply\b/,
  /\bclass\s+FolioleCompanionSyncObjectApply\b/,
  /\bclass\s+FolioleCompanionSyncConflictCopyIdentity\b/,
  /\bclass\s+FolioleCompanionSyncConflictCopyMappings\b/,
  /\bclass\s+FolioleCompanionSyncConflictCopyProjection\b/,
  /\bclass\s+FolioleCompanionSyncConflictCopies\b/,
  /\bclass\s+FolioleCompanionSyncLocalNodeState\b/,
  /\bclass\s+FolioleCompanionSyncNodeVersionApplySupport\b/,
  /\bapplyDesktopSyncPack\s*\(/,
  /\bapplySyncPack\s*\(/,
  /\bapplyNodeVersions\s*\(/,
  /\bapplySyncNodeVersions\s*\(/,
  /\bapplyReviewLog\s*\(/,
  /\bpublic\s+void\s+applySyncObjects\s*\(/,
  /\bpublic\s+void\s+applySyncReviewLog\s*\(/
];

function listJavaFiles(dir: string): string[] {
  const absoluteDir = join(ROOT, dir);
  return readdirSync(absoluteDir).flatMap((entry) => {
    const absolutePath = join(absoluteDir, entry);
    const path = relative(ROOT, absolutePath).replaceAll('\\', '/');
    if (statSync(absolutePath).isDirectory()) return listJavaFiles(path);
    return path.endsWith('.java') ? [path] : [];
  });
}

it('keeps desktop sync-pack apply out of Android production Java', () => {
  const violations = listJavaFiles(ANDROID_MAIN_JAVA).filter((path) => {
    const source = readFileSync(join(ROOT, path), 'utf8');
    return FORBIDDEN_MAIN_PATTERNS.some((pattern) => pattern.test(source));
  });

  expect(violations).toEqual([]);
});
