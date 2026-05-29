// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const JAVA_ROOT = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android');

function collectJavaFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.java') ? [entryPath] : [];
  });
}

function relativeFile(filePath) {
  return path.relative(JAVA_ROOT, filePath).replaceAll(path.sep, '/');
}

describe('Android Java API compatibility', () => {
  it('avoids Java APIs that are unavailable on Android 9', () => {
    const matches = collectJavaFiles(JAVA_ROOT).flatMap((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      return [...source.matchAll(/\.toString\(StandardCharsets\.[^)]+\)/g)].map((match) => ({
        file: relativeFile(filePath),
        text: match[0]
      }));
    });

    expect(matches).toEqual([]);
  });
});
