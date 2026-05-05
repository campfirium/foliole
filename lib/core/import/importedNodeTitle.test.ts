import { describe, expect, it } from 'vitest';

import { extractUniqueLevelOneHeading, resolveImportedNodeTitle } from './importedNodeTitle.js';

describe('importedNodeTitle', () => {
  it('falls back to the source name without extension', () => {
    expect(
      resolveImportedNodeTitle({
        content: 'Body only',
        sourceName: 'Daily/note.md',
        titleStrategy: 'file_name'
      })
    ).toBe('Daily/note');
  });

  it('uses the only level-one heading when the heading strategy is enabled', () => {
    expect(
      resolveImportedNodeTitle({
        content: '# Imported title\n\nBody',
        sourceName: 'note.md',
        titleStrategy: 'heading'
      })
    ).toBe('Imported title');
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
