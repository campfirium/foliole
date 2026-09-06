import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Windows DEV process snapshot boundary', () => {
  it('matches repository descendants without matching sibling path prefixes', () => {
    const source = fs.readFileSync(
      'scripts/windows/windows-dev-process-snapshot.ps1', 'utf8'
    );

    expect(source).toContain('$repoDescendantPrefix = "$canonicalRepo\\"');
    expect(source).toContain('IndexOf($repoDescendantPrefix, [StringComparison]::OrdinalIgnoreCase)');
    expect(source).not.toContain('IndexOf($canonicalRepo, [StringComparison]::OrdinalIgnoreCase)');
  });
});
