import { markdownLanguage } from '@codemirror/lang-markdown';
import { describe, expect, it } from 'vitest';

function collectNodeNames(markdown: string) {
  const names = new Set<string>();
  markdownLanguage.parser.parse(markdown).cursor().iterate((node) => {
    names.add(node.name);
  });
  return names;
}

describe('CodeMirror markdown language baseline', () => {
  it('recognizes GFM table structure', () => {
    const names = collectNodeNames('| A | B |\n| --- | --- |\n| 1 | 2 |');

    expect(names).toContain('Table');
    expect(names).toContain('TableHeader');
    expect(names).toContain('TableRow');
    expect(names).toContain('TableCell');
  });

  it('recognizes GFM task list, strikethrough, and autolink syntax', () => {
    const names = collectNodeNames('- [x] done\n\n~~gone~~\n\nhttps://example.com');

    expect(names).toContain('Task');
    expect(names).toContain('TaskMarker');
    expect(names).toContain('Strikethrough');
    expect(names).toContain('URL');
  });
});
