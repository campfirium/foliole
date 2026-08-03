// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const source = fs.readFileSync('.github/workflows/deploy-release-manifest.yml', 'utf8');
const workflow = parse(source);

describe('deploy release manifest workflow contract', () => {
  it('publishes only merged dev metadata for an already-public Release', () => {
    expect(workflow.on.push.branches).toEqual(['dev']);
    expect(workflow.on.workflow_dispatch).toBeNull();
    expect(source).toContain('test "$DEPLOY_REF" = "refs/heads/dev"');
    expect(source).toContain('releases/tags/v${latest_version}');
    expect(source).toContain('select(.draft == false and .published_at != null)');
    expect(source).toContain('gh release download "v${latest_version}"');
    expect(source).toContain('node scripts/release-asset-contract.mjs list');
    expect(source).toContain('node scripts/release-asset-contract.mjs verify-directory');
    expect(source).toContain('node scripts/prepare-release-manifest-site.mjs');
    expect(workflow.jobs.build.steps.find((step) => step.uses === 'actions/checkout@v4').with['fetch-depth']).toBe(2);
    expect(source).not.toContain('- main');
  });
});
