import type { NativeTextImportArgs } from '../../lib/platform/nativeContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { withTextImportNodeMutationPatch } from '../import/importNodeMutationPatch.js';
import { notifyManagedInboxUpdated } from '../import/managedInboxEvents.js';

import { resolveClipboardTextSourceName } from './clipboardTextSourceName.js';
import {
  buildPreparedImportRecord,
  importTargetParentNodeProps,
  resolveImportHighlightPolicy
} from './importSourcePipeline.js';
import { toNativeTextImportResult } from './importTextFile.js';

export async function runTextCaptureToInbox(text: string, args?: NativeTextImportArgs) {
  const content = text.trim();
  if (!content) {
    return null;
  }
  const importedAt = new Date().toISOString();
  const sourceName = resolveClipboardTextSourceName(content);
  const result = await runWithDatabaseConnectionOwner(() => withTextImportNodeMutationPatch(toNativeTextImportResult(
    runPreparedImport(
      buildPreparedImportRecord(
        {
          filePath: `capture://text/${importedAt}`,
          kind: 'text',
          sourceName
        },
        {
          content,
          highlightPolicy: resolveImportHighlightPolicy(args),
          importedAt,
          sourceLocator: `capture://text/${importedAt}`,
          sourceTrackingMode: 'untracked',
          ...importTargetParentNodeProps(args),
          titleStrategy: 'heading'
        }
      )
    )
  )));
  notifyManagedInboxUpdated(result.import_id, result.node_mutation_patch);
  return result;
}
