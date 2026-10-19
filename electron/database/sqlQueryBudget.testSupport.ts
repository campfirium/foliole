import type { SqlStatementGroup, SqlStatementReport } from './sqlStatementMeter.testSupport.js';

export interface SqlQueryBudget {
  maxRepeatsPerStatement?: number;
  maxRowsRead?: number;
  maxStatements?: number;
}

const LISTED_GROUPS = 8;

function describeGroups(groups: SqlStatementGroup[]) {
  return groups.slice(0, LISTED_GROUPS)
    .map((group) => `  ${group.count}x rows=${group.rows} ${group.sql.slice(0, 160)}`)
    .join('\n');
}

function describeReport(report: SqlStatementReport) {
  return `statements=${report.statements} rowsRead=${report.rowsRead}\n${describeGroups(report.groups)}`;
}

export function assertSqlQueryBudget(label: string, report: SqlStatementReport, budget: SqlQueryBudget) {
  const violations: string[] = [];
  if (budget.maxStatements !== undefined && report.statements > budget.maxStatements) {
    violations.push(`statements ${report.statements} > ${budget.maxStatements}`);
  }
  if (budget.maxRowsRead !== undefined && report.rowsRead > budget.maxRowsRead) {
    violations.push(`rowsRead ${report.rowsRead} > ${budget.maxRowsRead}`);
  }
  const repeated = report.groups[0];
  if (budget.maxRepeatsPerStatement !== undefined && repeated && repeated.count > budget.maxRepeatsPerStatement) {
    violations.push(`one statement ran ${repeated.count}x > ${budget.maxRepeatsPerStatement}`);
  }
  if (violations.length === 0) return;
  throw new Error(`${label} exceeded its SQL budget: ${violations.join('; ')}\n${describeReport(report)}`);
}

/**
 * Asserts that statement counts do not grow with library size. `rowsRead` may
 * grow only when `allowRowGrowth` is set (for commands that return every row).
 */
export function assertSqlScaleInvariant(
  label: string,
  small: SqlStatementReport,
  large: SqlStatementReport,
  options: { allowRowGrowth?: boolean } = {}
) {
  const violations: string[] = [];
  if (large.statements > small.statements) {
    violations.push(`statements grew ${small.statements} -> ${large.statements}`);
  }
  if (!options.allowRowGrowth && large.rowsRead > small.rowsRead) {
    violations.push(`rowsRead grew ${small.rowsRead} -> ${large.rowsRead}`);
  }
  if (violations.length === 0) return;
  throw new Error(`${label} scales with library size: ${violations.join('; ')}\n` +
    `small: ${describeReport(small)}\nlarge: ${describeReport(large)}`);
}
