// @vitest-environment node

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = fs.readFileSync('.github/workflows/sync-site-downloads.yml', 'utf8');

describe('site download sync workflow contract', () => {
  it('reconciles production after Pages publishes or skips an unchanged directory', () => {
    expect(workflow).toContain('workflow_run:');
    expect(workflow).toContain('workflows: [Deploy Release Manifest]');
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).not.toContain('schedule:');
    expect(workflow).toContain('.conclusion == "success" or .conclusion == "skipped"');
    expect(workflow).toContain('https://foliole.app/downloads.json');
    expect(workflow).toContain('403|404)');
    expect(workflow).toContain('[[ "$directory" != "$deployed" ]]');
  });

  it('dispatches the canonical platform directory with the dedicated repository token', () => {
    expect(workflow).toContain('secrets.FOLIOLE_SITE_SYNC_TOKEN');
    expect(workflow).toContain('repos/campfirium/foliole-site/dispatches');
    expect(workflow).toContain('event_type=foliole-release-published');
    expect(workflow).toContain('client_payload[directory_url]=https://campfirium.github.io/foliole/releases/downloads.json');
  });
});
