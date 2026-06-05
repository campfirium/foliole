import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { allowedRegexInventory } from './markdownRegexInventoryAllowlist';

interface RegexFinding {
  line: string;
  path: string;
}

const scannedRoots = [
  'src/features/editor/model',
  'src/features/editor/adapters',
  'src/features/editor/components'
];

const regexTruthBoundary =
  /const\s+\w*PATTERN\b|RegExp|\.match\(|\.exec\(|\.test\(|\.replace(?:All)?\s*\(\s*\/|\.split\s*\(\s*\//;
const inventorySupportFiles = new Set(['src/features/editor/model/markdownRegexInventoryAllowlist.ts']);

function listSourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const fullPath = path.join(root, entry);
    const relativePath = path.relative(process.cwd(), fullPath).replaceAll(path.sep, '/');
    if (statSync(fullPath).isDirectory()) return listSourceFiles(fullPath);
    if (inventorySupportFiles.has(relativePath)) return [];
    if (!/\.(ts|tsx)$/.test(fullPath) || /\.test\.(ts|tsx)$/.test(fullPath)) return [];
    return [fullPath];
  });
}

function collectRegexFindings(): RegexFinding[] {
  return scannedRoots.flatMap(listSourceFiles).flatMap((filePath) => {
    const relativePath = path.relative(process.cwd(), filePath).replaceAll(path.sep, '/');
    return readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => regexTruthBoundary.test(line))
      .map((line) => ({ line, path: relativePath }));
  });
}

describe('markdown regex inventory', () => {
  it('keeps remaining editor regex outside markdown renderer truth', () => {
    const findings = collectRegexFindings().map((finding) => `${finding.path} :: ${finding.line}`);
    const allowed = allowedRegexInventory.map((item) => `${item.path} :: ${item.line}`);

    expect(findings.sort()).toEqual(allowed.sort());
    expect(allowedRegexInventory.map((item) => item.owner).every(Boolean)).toBe(true);
  });
});
