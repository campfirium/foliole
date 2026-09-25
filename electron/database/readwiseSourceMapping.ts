import { recordImportSourceSync } from '../../lib/core/database/importPipelineRecords.js';

import { openDatabaseConnection } from './connection.js';
import { loadDesktopSourceByConfig } from './desktopSources.js';

export function recordReadwiseImportSourceMapping(args: {
  relativePath: string; ruleId: string; sourceFingerprint: string; updatedAt: string;
}) {
  const source = loadDesktopSourceByConfig('readwise', args.ruleId);
  const relativePath = args.relativePath.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!source || !relativePath || relativePath === '..' || relativePath.startsWith('../')) return;
  const driver = openDatabaseConnection().driver;
  driver.execute(
    'UPDATE import_sources SET source_ref = ?, source_location = ? WHERE source_fingerprint = ?',
    [source.source_ref, relativePath, args.sourceFingerprint]
  );
  recordImportSourceSync(driver, args.sourceFingerprint, args.updatedAt);
}
