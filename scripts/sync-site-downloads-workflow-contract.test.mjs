// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync('.github/workflows/sync-site-downloads.yml', 'utf8');

describe('site download sync workflow contract', () => {
  it('notifies the site only after a release is published', () => {
    expect(workflow).toContain('release:');
    expect(workflow).toContain('types: [published]');
    expect(workflow).not.toContain('schedule:');
  });

  it('dispatches the published tag with the dedicated repository token', () => {
    expect(workflow).toContain('secrets.FOLIOLE_SITE_SYNC_TOKEN');
    expect(workflow).toContain('repos/campfirium/foliole-site/dispatches');
    expect(workflow).toContain('event_type=foliole-release-published');
    expect(workflow).toContain('client_payload[tag]=$RELEASE_TAG');
  });
});
