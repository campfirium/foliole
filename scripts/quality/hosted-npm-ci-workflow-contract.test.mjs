// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const WORKFLOW_ROOT = '.github/workflows';
const RUNNER = 'scripts/quality/hosted-npm-ci.mjs';
const workflowPaths = fs.readdirSync(WORKFLOW_ROOT)
  .filter((name) => name.endsWith('.yml'))
  .map((name) => path.join(WORKFLOW_ROOT, name));

function installCommands(value, commands = []) {
  if (Array.isArray(value)) {
    for (const child of value) installCommands(child, commands);
    return commands;
  }
  if (!value || typeof value !== 'object') return commands;
  if (typeof value.run === 'string' && value.run.includes(RUNNER)) commands.push(value.run);
  for (const child of Object.values(value)) installCommands(child, commands);
  return commands;
}

describe('hosted npm ci workflow contract', () => {
  it('routes every workflow dependency install through the repository runner', () => {
    const sources = workflowPaths.map((file) => fs.readFileSync(file, 'utf8'));
    expect(sources.join('\n')).not.toMatch(/(?:^|\s)npm ci(?:\s|$)/mu);
    const commands = workflowPaths.flatMap((file) => installCommands(parse(fs.readFileSync(file, 'utf8'))));
    expect(commands).toHaveLength(19);
    expect(commands.filter((command) => command.includes('--ignore-scripts'))).toHaveLength(2);
  });

  it('keeps baseline installs script-free before the explicit Electron installer', () => {
    for (const name of ['release-macos.yml', 'release-windows.yml']) {
      const source = fs.readFileSync(path.join(WORKFLOW_ROOT, name), 'utf8');
      const runner = source.indexOf(`${RUNNER}" --ignore-scripts`);
      expect(runner).toBeGreaterThan(-1);
      expect(runner).toBeLessThan(source.indexOf('node node_modules/electron/install.js'));
    }
  });
});
