import type { SqlScaleProbe } from './sqlScaleProbe.testSupport.js';
import { formatFullScanFindings, fullScanFindingId, type FullScanFinding } from './sqlScanPlan.testSupport.js';

/**
 * Per-item scans that existed when the scale guard was introduced. A new finding fails its test; so does an
 * entry here that no longer matches anything, so fixed debt is removed instead of hiding the next regression.
 */
export interface KnownScan {
  id: RegExp;
  sql?: RegExp;
  reason: string;
}

const BODY_HOLDER_SCAN: KnownScan = {
  id: /\| lib\/core\/database\/textBodyBlobCollection\.ts \| statement \|/u,
  reason: 'each released body hash searches every text and JSON column for holders (issue #165 shape)'
};

/** The holder lookups behind BODY_HOLDER_SCAN, as the probe records them. */
const BODY_HOLDER_STATEMENT = { caller: /^lib\/core\/database\/textBodyBlobCollection\.ts:/u, sql: /^SELECT 1 AS held /u };

export const KNOWN_UPGRADE_SCANS: KnownScan[] = [];

export const KNOWN_RUNTIME_SCANS: KnownScan[] = [BODY_HOLDER_SCAN];

export const KNOWN_RUNTIME_GROWTH: RegExp[] = [/^(?:statement|step) time .* in collect_text_bodies: /u];

function matches(known: KnownScan, finding: FullScanFinding) {
  return known.id.test(fullScanFindingId(finding)) && (!known.sql || known.sql.test(finding.sql));
}

/** Findings no entry explains, and entries nothing matched any more. */
export function compareWithKnownScans(findings: FullScanFinding[], known: KnownScan[]) {
  return {
    unexpected: formatFullScanFindings(findings.filter((finding) => !known.some((entry) => matches(entry, finding)))),
    fixed: known.filter((entry) => !findings.some((finding) => matches(entry, finding))).map((entry) => entry.reason)
  };
}

export function withoutKnownGrowth(lines: string, known: RegExp[]) {
  return lines.split('\n').filter((line) => line && !known.some((pattern) => pattern.test(line))).join('\n');
}

/**
 * A run's step times without the known holder lookups, so a step budget measures everything else in the step.
 * Apply per run before `fastestRun`, so each step only loses time it actually spent.
 */
export function withoutKnownScanTime(profile: Pick<SqlScaleProbe, 'records' | 'stepMs'>) {
  const stepMs = new Map(profile.stepMs);
  for (const [step, records] of profile.records) {
    for (const record of records.values()) {
      if (!BODY_HOLDER_STATEMENT.caller.test(record.caller) || !BODY_HOLDER_STATEMENT.sql.test(record.sql)) continue;
      stepMs.set(step, (stepMs.get(step) ?? 0) - record.totalMs);
    }
  }
  return { records: profile.records, stepMs };
}
