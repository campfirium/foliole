import { describe, expect, it } from 'vitest';

import { extractUniqueLevelOneHeading, resolveImportedNodeTitle } from '../../lib/core/import/importedNodeTitle';

describe('importedNodeTitle', () => {
  it('uses the unique level-one heading even when the file-name strategy is selected', () => {
    expect(
      resolveImportedNodeTitle({
        content: '# Imported title\n\nBody',
        sourceName: 'Daily/note.md',
        titleStrategy: 'file_name'
      })
    ).toBe('Imported title');
  });

  it('falls back to the source name without extension when there is no unique h1', () => {
    expect(
      resolveImportedNodeTitle({
        content: 'Body only',
        sourceName: 'Daily/note.md',
        titleStrategy: 'file_name'
      })
    ).toBe('Daily/note');
  });

  it('falls back to the file name when there are multiple level-one headings', () => {
    expect(extractUniqueLevelOneHeading('# One\n\n# Two')).toBeNull();
    expect(
      resolveImportedNodeTitle({
        content: '# One\n\n# Two',
        sourceName: 'note.md',
        titleStrategy: 'heading'
      })
    ).toBe('note');
  });
});
