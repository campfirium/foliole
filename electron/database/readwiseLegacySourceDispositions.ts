import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';

import type { SourceDisposition, SourceDispositionKey, SourceKeyRow } from './sourceDispositionStates.js';
import {
  readReadwiseRuleIds,
  sourceDispositionKeyId,
  toSourceDispositionKey
} from './sourceDispositionStates.js';

interface DispositionRow extends DatabaseRow, SourceDispositionKey {
  disposition: SourceDisposition;
}

export interface ReadwiseLegacySourceDisposition {
  disposition: SourceDisposition;
  key: SourceDispositionKey;
  ruleId: string;
  sourcePath: string;
}

export function listReadwiseLegacySourceDispositions(driver: DatabaseDriver) {
  const dispositions = new Map(driver.queryAll<DispositionRow>(
    `SELECT source_kind AS sourceKind, source_scope AS sourceScope,
            original_title AS originalTitle, disposition
     FROM source_disposition_states WHERE source_kind = 'readwise'`
  ).map((row) => [sourceDispositionKeyId(row), row]));
  const readwiseRuleIds = readReadwiseRuleIds();
  return driver.queryAll<SourceKeyRow>(
    `SELECT item.rule_id, item.source_path, cache.title
     FROM keep_import_items item JOIN keep_import_item_cache cache
       ON cache.rule_id = item.rule_id AND cache.source_path = item.source_path`
  ).flatMap((row): ReadwiseLegacySourceDisposition[] => {
    const key = toSourceDispositionKey(row, readwiseRuleIds);
    const disposition = key ? dispositions.get(sourceDispositionKeyId(key)) : null;
    return key && disposition ? [{
      disposition: disposition.disposition, key, ruleId: row.rule_id, sourcePath: row.source_path
    }] : [];
  });
}
