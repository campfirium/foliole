import type { DatabaseDriver } from '../../lib/core/database/driver.js';

export interface RecoveryAnchor {
  anchorLink: string;
  childId: string;
  source: 'historical_snapshot' | 'unique_original_text';
  sourceVersionId: string | null;
}

interface AnchorRow {
  [column: string]: unknown;
  anchor_link: string;
  id: string;
}

interface VersionRow {
  [column: string]: unknown;
  snapshot_json: string;
  version_id: string;
}

type RawAnchor = { locator?: unknown; [key: string]: unknown };
type TextLocator = { from: number; originalText: string; to: number };

function textLocators(value: unknown): TextLocator[] | null {
  if (!value || typeof value !== 'object') return null;
  const locator = value as { from?: unknown; originalText?: unknown; ranges?: unknown; to?: unknown };
  if (Array.isArray(locator.ranges)) {
    const ranges = locator.ranges.map(textLocators);
    if (ranges.some((range) => !range || range.length !== 1)) return null;
    return ranges.flatMap((range) => range ?? []);
  }
  return Number.isInteger(locator.from) && Number.isInteger(locator.to) && typeof locator.originalText === 'string'
    ? [{ from: locator.from as number, originalText: locator.originalText, to: locator.to as number }]
    : null;
}

function parseAnchor(value: string): RawAnchor | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as RawAnchor : null;
  } catch {
    return null;
  }
}

function locatorMatches(content: string, locator: unknown) {
  const ranges = textLocators(locator);
  return Boolean(ranges?.length && ranges.every((range) =>
    range.from >= 0 && range.to >= range.from && content.slice(range.from, range.to) === range.originalText
  ));
}

export function validateAnchorInContent(anchorLink: string, content: string) {
  const anchor = parseAnchor(anchorLink);
  return Boolean(anchor && locatorMatches(content, anchor.locator));
}

function withLocator(current: RawAnchor, locator: unknown) {
  return JSON.stringify({ ...current, locator });
}

function uniqueLocator(current: RawAnchor, content: string) {
  const ranges = textLocators(current.locator);
  if (!ranges?.length) return null;
  const relocated = ranges.map((range) => {
    const first = content.indexOf(range.originalText);
    if (first < 0 || content.indexOf(range.originalText, first + 1) >= 0) return null;
    return { ...range, from: first, to: first + range.originalText.length };
  });
  if (relocated.some((range) => range === null)) return null;
  return ranges.length === 1 ? relocated[0] : { ranges: relocated };
}

function historicalAnchor(driver: DatabaseDriver, childId: string, content: string) {
  const versions = driver.queryAll<VersionRow>(
    `SELECT version_id, snapshot_json FROM node_sync_versions
     WHERE object_id = ? AND snapshot_json IS NOT NULL
     ORDER BY created_at DESC, version_id DESC`,
    [childId]
  );
  for (const version of versions) {
    try {
      const snapshot = JSON.parse(version.snapshot_json) as { anchor_link?: unknown };
      if (typeof snapshot.anchor_link !== 'string') continue;
      const anchor = parseAnchor(snapshot.anchor_link);
      if (!anchor) continue;
      if (locatorMatches(content, anchor.locator)) return { anchor, versionId: version.version_id };
      const relocated = uniqueLocator(anchor, content);
      if (relocated) return { anchor: { ...anchor, locator: relocated }, versionId: version.version_id };
    } catch {
      continue;
    }
  }
  return null;
}

export function resolveRecoveryAnchors(driver: DatabaseDriver, parentId: string, content: string) {
  const rows = driver.queryAll<AnchorRow>(
    `SELECT id, anchor_link FROM nodes
     WHERE parent_id = ? AND deleted_at IS NULL AND anchor_link IS NOT NULL ORDER BY id`, [parentId]
  );
  const anchors: RecoveryAnchor[] = [];
  for (const row of rows) {
    const current = parseAnchor(row.anchor_link);
    if (!current) return { anchors: [], reason: `invalid_anchor_link:${row.id}` };
    const historical = historicalAnchor(driver, row.id, content);
    if (historical) {
      anchors.push({ anchorLink: withLocator(current, historical.anchor.locator), childId: row.id,
        source: 'historical_snapshot', sourceVersionId: historical.versionId });
      continue;
    }
    const locator = uniqueLocator(current, content);
    if (!locator) return { anchors: [], reason: `anchor_not_unique_or_missing:${row.id}` };
    anchors.push({ anchorLink: withLocator(current, locator), childId: row.id,
      source: 'unique_original_text', sourceVersionId: null });
  }
  return { anchors, reason: null };
}
