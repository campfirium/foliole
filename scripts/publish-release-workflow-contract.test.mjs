// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync('.github/workflows/publish-release.yml', 'utf8');

describe('publish release workflow contract', () => {
  it('binds both artifact sets to successful fixed source runs', () => {
    expect(workflow).toContain('actions: read');
    expect(workflow).toContain('completed\\tsuccess\\t');
    expect(workflow).toContain('foliole-macos-release');
    expect(workflow).toContain('foliole-windows-release');
    expect(workflow.match(/run-id: \$\{\{ inputs\./gu)).toHaveLength(2);
  });

  it('verifies updater assets and checksums before creating a draft', () => {
    expect(workflow).toContain('sha256sum --check SHA256SUMS.txt');
    expect(workflow).toContain('latest-mac.yml');
    expect(workflow).toContain('latest.yml');
    expect(workflow).toContain('gh release create');
    expect(workflow).toContain('--draft');
    expect(workflow).not.toContain('gh release edit');
  });
});
