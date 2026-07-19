// @vitest-environment node

import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync('.github/workflows/sync-sqlite-capability-gates.yml', 'utf8');

describe('iOS bootstrap quality workflow contract', () => {
  it('runs the complete iOS bootstrap acceptance on a macOS runner', () => {
    expect(workflow).toContain('ios-bootstrap-quality:');
    expect(workflow).toContain('runs-on: macos-15');
    expect(workflow).toContain('run: npm run quality:ios');
  });

  it('remains read-only and manually dispatched', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).not.toContain('\n  push:');
    expect(workflow).not.toContain('\n  pull_request:');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).not.toContain('secrets.');
  });
});
