import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const templatePath = '.codex/monitors/templates/github-actions.md';

describe('T5 repair controller prompt', () => {
  it('coordinates persistent visible worker threads and keeps rechecks in the controller', () => {
    const template = fs.readFileSync(templatePath, 'utf8');

    expect(template).toContain('never use collaboration subagents');
    expect(template).toContain('If App thread tools are unavailable, stop');
    expect(template).not.toContain('codex exec');
    expect(template).toContain('create at most one visible worker thread');
    expect(template).toContain('iterate autonomously until its whole assigned family is green');
    expect(template).toContain('Do not emit a final answer while any worker is active');
    expect(template).toContain('without waiting for user input');
    expect(template).toContain('send the evidence back to the original worker thread');
    expect(template).toContain('Workers must preserve unrelated dirty changes');
    expect(template).toContain('only after explicit user authorization');
    expect(template).toContain('remote-quality.mjs --scope full');
    expect(template).toContain('do not dispatch another T5 workflow for a repair recheck');
  });
});
