// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  REMOVED_BUSINESS_FORKS,
  classifiedFiles,
  classificationEntries,
  inspectJavaAdapterBoundarySource
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

function mainActivitySource() {
  return fs.readFileSync(path.join(JAVA_ROOT, 'MainActivity.java'), 'utf8');
}

describe('Android Java adapter boundary', () => {
  it('documents a concrete host responsibility for every classification bucket', () => {
    expect(classificationEntries().map(({ kind, responsibility, files }) => ({
      kind,
      hasResponsibility: responsibility.length > 20,
      fileCount: files.length
    }))).toEqual([
      { kind: 'asset_support', hasResponsibility: true, fileCount: 6 },
      { kind: 'bridge_contract_metadata', hasResponsibility: true, fileCount: 3 },
      { kind: 'bridge_plugin_adapter', hasResponsibility: true, fileCount: 11 },
      { kind: 'generated_definition_reader', hasResponsibility: true, fileCount: 29 },
      { kind: 'host_platform_adapter', hasResponsibility: true, fileCount: 15 },
      { kind: 'migration_adapter', hasResponsibility: true, fileCount: 5 },
      { kind: 'query_mutation_executor', hasResponsibility: true, fileCount: 4 },
      { kind: 'sync_diagnostic_adapter', hasResponsibility: true, fileCount: 6 },
      { kind: 'store_executor', hasResponsibility: true, fileCount: 34 }
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

  it('registers the packaged Capacitor SQLite plugin used by shared sync-pack apply', () => {
    expect(mainActivitySource()).toContain(
      'import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;'
    );
    expect(mainActivitySource()).toContain('registerPlugin(CapacitorSQLitePlugin.class);');
  });

  it('blocks obvious sync conflict, review scheduling, and schema authoring rules in Java', () => {
    const matches = productionJavaFiles().flatMap((file) => {
      const source = fs.readFileSync(path.join(JAVA_ROOT, file), 'utf8');
      return inspectJavaAdapterBoundarySource(file, source);
    });

    expect(matches).toEqual([]);
  });

  it('flags Java-side filtering of generated query results', () => {
    const source = `
      JSObject result = FolioleCompanionGeneratedQueryRunner.load(context, database, queryName, args);
      JSONArray rows = result.getJSONArray(resultKey);
      JSONArray filtered = new JSONArray();
      for (int index = 0; index < rows.length(); index += 1) {
        JSONObject row = rows.getJSONObject(index);
        if (!row.optString("object_id").startsWith("conflict-copy-")) {
          filtered.put(row);
        }
      }
      result.put(resultKey, filtered);
    `;

    expect(inspectJavaAdapterBoundarySource('FolioleCompanionSyncNodeVersionStore.java', source))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'forbidden_business_rule' }),
        expect.objectContaining({ kind: 'generated_result_filter' })
      ]));
  });

  it('allows Java adapter glue that only appends generated ancestor fields', () => {
    const source = `
      JSObject result = FolioleCompanionGeneratedQueryRunner.load(context, database, queryName, args);
      JSONArray nodes = result.getJSONArray(resultKey);
      for (int index = 0; index < nodes.length(); index += 1) {
        JSONObject node = nodes.getJSONObject(index);
        node.put(
          FolioleCompanionSyncStreamQueryRules.nodeVersionAncestorIdsKey(context),
          listAncestorVersionIds(context, database, node.getString(FolioleCompanionSyncStreamQueryRules.nodeVersionIdKey(context)))
        );
      }
    `;

    expect(inspectJavaAdapterBoundarySource('FolioleCompanionSyncNodeVersionStore.java', source)).toEqual([]);
  });
});
