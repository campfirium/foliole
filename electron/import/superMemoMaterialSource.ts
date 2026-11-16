import type { SuperMemoSourceFormat } from '../../lib/core/import/superMemoSourceFormatting.js';
import type { NativeSuperMemoPreviewRow } from '../../lib/platform/nativeSuperMemoImportContract.js';

import { addSuperMemoCitation, describeSuperMemoCitation } from './superMemoCitation.js';

export function formatSuperMemoMaterialSource(row: NativeSuperMemoPreviewRow, parent: NativeSuperMemoPreviewRow | undefined,
  article: { id: string; title: string } | undefined, format: SuperMemoSourceFormat, body: string) {
  const citation = describeSuperMemoCitation(row, parent, article, format);
  return { citation, content: addSuperMemoCitation(body, citation, 'content') };
}
