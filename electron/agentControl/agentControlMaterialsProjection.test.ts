// @vitest-environment node
import { expect, it } from 'vitest';

import { projectAgentMaterialSearchResults } from './agentControlMaterials.js';

it('projects external search results without private absolute paths', () => {
  const projected = projectAgentMaterialSearchResults([
    {
      excerpt: 'External Atlas hit',
      externalMatch: {
        absolutePath: 'D:\\Private\\Atlas.md',
        folderId: 'folder-secret',
        folderPath: 'D:\\Private',
        importedNodeId: 'imported-node',
        query: 'Atlas',
        relativePath: 'Atlas.md',
        sourceKind: 'external'
      },
      id: 'external-1',
      kind: 'external',
      nodeMatch: null,
      pdfMatch: null,
      title: 'Atlas.md',
      updatedAt: '2026-07-05T00:00:00.000Z'
    }
  ], 10);

  expect(projected).toEqual([{
    excerpt: 'External Atlas hit',
    id: 'external-1',
    kind: 'external',
    match: { kind: 'external', query: 'Atlas' },
    source: {
      imported_material_id: 'imported-node',
      kind: 'external',
      relative_path: 'Atlas.md',
      source_kind: 'external'
    },
    title: 'Atlas.md',
    updated_at: '2026-07-05T00:00:00.000Z'
  }]);
  expect(JSON.stringify(projected)).not.toContain('D:\\Private');
  expect(JSON.stringify(projected)).not.toContain('folder-secret');
});
