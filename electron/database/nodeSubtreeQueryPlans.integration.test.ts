// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { VISIBLE_NODES_CTE_SQL } from '../../lib/core/database/workspaceVisibleNodesSql.js';

import { closeLibraries, createPeer, startLibraries, type Peer } from './syncLibrary.testSupport.js';

// SQLite prefers the low-selectivity deleted_at index over the id or parent index, rereading every live node per step.
let peer: Peer;
beforeAll(async () => {
  await startLibraries();
  peer = createPeer('desktop');
  peer.db.function('source_search_lower', (value: unknown) => String(value).toLocaleLowerCase());
});
afterAll(closeLibraries);

interface PlanRow { id: number; parent: number; detail: string }

function explain(sql: string) {
  const statement = peer.db.prepare(`EXPLAIN QUERY PLAN ${sql}`);
  return statement.all(...Array.from({ length: sql.split('?').length - 1 }, () => null)) as PlanRow[];
}

function recursiveStepDetails(rows: PlanRow[]) {
  const inside = new Set(rows.filter((row) => row.detail === 'RECURSIVE STEP').map((row) => row.id));
  return rows.filter((row) => {
    if (!inside.has(row.parent)) return false;
    inside.add(row.id);
    return true;
  }).map((row) => row.detail);
}

// Interpolated column lists, limits and predicates do not choose the tree index, so a literal stands in.
function literalText(node: ts.TemplateLiteral | ts.StringLiteral) {
  if (!ts.isTemplateExpression(node)) return node.text;
  return node.head.text + node.templateSpans.map((span) => `1${span.literal.text}`).join('');
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.tsx?$/u.test(file) && !/\.test\.|testSupport|test-support|TestSupport/u.test(file) ? [file] : [];
  });
}

function recursiveNodeQueries(file: string) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const queries: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) {
      const sql = literalText(node);
      if (/^\s*WITH RECURSIVE/u.test(sql) && /\bnodes\b/u.test(sql) && /\bparent_id\b/u.test(sql)
        && /\bdeleted_at\b/u.test(sql)) queries.push(sql);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return queries;
}

// Composed from fragments at run time, so the literal alone is not a statement.
const COMPOSED = new Set([
  'lib/core/database/companionContentSnapshotQuery.ts',
  'lib/core/database/companionSnapshotNodeQuery.ts',
  'lib/core/database/workspaceSearchIndexSql.ts',
  'lib/core/database/workspaceSnapshot.ts',
  'lib/core/database/workspaceVisibleNodesSql.ts',
  'lib/core/sync/syncNodeTombstoneApply.ts'
]);

it('never walks the node tree through the deleted_at index', () => {
  const offenders: string[] = [];
  let checked = 0;
  for (const file of ['lib', 'electron', 'src'].flatMap(sourceFiles)) {
    for (const sql of recursiveNodeQueries(file)) {
      let rows: PlanRow[];
      try {
        rows = explain(sql);
      } catch (error) {
        if (!COMPOSED.has(file)) offenders.push(`${file}: cannot explain (${String(error)})`);
        continue;
      }
      checked += 1;
      if (recursiveStepDetails(rows).some((detail) => detail.includes('idx_nodes_deleted_at'))) offenders.push(file);
    }
  }
  expect(offenders).toEqual([]);
  expect(checked).toBeGreaterThan(15);
});

it('walks the shared visible tree through the parent index', () => {
  const details = recursiveStepDetails(explain(`${VISIBLE_NODES_CTE_SQL} SELECT id FROM visible_nodes`));
  expect(details.join('\n')).toContain('idx_nodes_parent_id');
  expect(details.join('\n')).not.toContain('idx_nodes_deleted_at');
});

it.each([
  'lib/core/database/nodeTrashReadingScope.ts',
  'src/shared/platform/companion/runtime/companionNewItemReviewLoad.ts'
])('looks up known nodes by key in %s', (file) => {
  const plans = recursiveNodeQueries(file).flatMap(explain).map((row) => row.detail);
  expect(plans.length).toBeGreaterThan(0);
  expect(plans.join('\n')).not.toContain('idx_nodes_deleted_at');
});
