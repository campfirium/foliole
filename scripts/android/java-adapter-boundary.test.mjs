// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  FORBIDDEN_BUSINESS_RULE_PATTERNS,
  REMOVED_BUSINESS_FORKS,
  classifiedFiles,
  classificationEntries
} from './java-adapter-boundary-rules.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const JAVA_ROOT = path.join(REPO_ROOT, 'android/app/src/main/java/com/foliole/android');

function productionJavaFiles() {
  return fs.readdirSync(JAVA_ROOT)
    .filter((entry) => entry.endsWith('.java'))
    .sort();
}

function duplicateClassifications() {
  const counts = new Map();
  for (const file of classifiedFiles()) counts.set(file, (counts.get(file) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([file]) => file);
}

describe('Android Java adapter boundary', () => {
  it('documents a concrete host responsibility for every classification bucket', () => {
    expect(classificationEntries().map(({ kind, responsibility, files }) => ({
      kind,
      hasResponsibility: responsibility.length > 20,
      fileCount: files.length
    }))).toEqual([
      { kind: 'asset_support', hasResponsibility: true, fileCount: 4 },
      { kind: 'bridge_contract_metadata', hasResponsibility: true, fileCount: 2 },
      { kind: 'bridge_plugin_adapter', hasResponsibility: true, fileCount: 10 },
      { kind: 'generated_definition_reader', hasResponsibility: true, fileCount: 27 },
      { kind: 'host_platform_adapter', hasResponsibility: true, fileCount: 13 },
      { kind: 'migration_adapter', hasResponsibility: true, fileCount: 3 },
      { kind: 'query_mutation_executor', hasResponsibility: true, fileCount: 4 },
      { kind: 'sync_diagnostic_adapter', hasResponsibility: true, fileCount: 6 },
      { kind: 'store_executor', hasResponsibility: true, fileCount: 27 }
    ]);
  });

  it('keeps every production Java class explicitly classified by adapter responsibility', () => {
    expect(duplicateClassifications()).toEqual([]);
    expect(productionJavaFiles()).toEqual(classifiedFiles());
  });

  it('keeps removed Android business-rule forks out of the production host', () => {
    const files = productionJavaFiles();
    expect(files.filter((file) => REMOVED_BUSINESS_FORKS.includes(file))).toEqual([]);
  });

  it('blocks obvious sync conflict, review scheduling, and schema authoring rules in Java', () => {
    const matches = productionJavaFiles().flatMap((file) => {
      const source = fs.readFileSync(path.join(JAVA_ROOT, file), 'utf8');
      return FORBIDDEN_BUSINESS_RULE_PATTERNS
        .filter((pattern) => pattern.test(`${file}\n${source}`))
        .map((pattern) => ({ file, pattern: pattern.source }));
    });

    expect(matches).toEqual([]);
  });
});
