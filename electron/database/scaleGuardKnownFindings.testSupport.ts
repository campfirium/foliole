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
