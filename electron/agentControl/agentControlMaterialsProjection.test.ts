// @vitest-environment node
import { expect, it } from 'vitest';

import {
  projectAgentMaterialReveal,
  projectAgentMaterialSearchResults
} from './agentControlMaterialsProjection.js';

it('bounds historical Item answers with explicit truncation metadata', () => {
  expect(projectAgentMaterialReveal('x'.repeat(4_001), 4_000)).toEqual({
    reveal: 'x'.repeat(4_000), reveal_char_count: 4_001, reveal_truncated: true
  });
});

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
    parent_titles: [],
    source: {
      imported_material_id: 'imported-node',
      kind: 'external',
      readable_material_id: 'imported-node',
      relative_path: 'Atlas.md',
      source_kind: 'external'
    },
    title: 'Atlas.md',
    updated_at: '2026-07-05T00:00:00.000Z'
  }]);
  expect(JSON.stringify(projected)).not.toContain('D:\\Private');
  expect(JSON.stringify(projected)).not.toContain('folder-secret');
});

it('projects pdf search results with readable material ids', () => {
  const projected = projectAgentMaterialSearchResults([
    {
      excerpt: 'PDF hit',
      externalMatch: null,
      id: 'pdf-node',
      kind: 'pdf',
      nodeMatch: null,
      pdfMatch: {
        attachmentId: 'attachment-1',
        matchStart: 12,
        page: 3,
        pageTextLength: 200,
        query: 'Atlas'
      },
      title: 'PDF',
      updatedAt: '2026-07-05T00:00:00.000Z'
    }
  ], 10);

  expect(projected[0]?.source).toEqual({ kind: 'pdf', readable_material_id: 'pdf-node' });
});
