// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync('.github/workflows/deploy-release-manifest.yml', 'utf8');

describe('deploy release manifest workflow contract', () => {
  it('publishes the release manifest and localized release notes to Pages', () => {
    expect(workflow).toContain('cp -R releases/. _site/releases/');
    expect(workflow).not.toContain('cp releases/update-manifest.json _site/releases/update-manifest.json');
  });
});
