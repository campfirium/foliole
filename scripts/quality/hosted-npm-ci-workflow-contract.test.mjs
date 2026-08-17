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
  if (typeof value.run === 'string' && (
    value.run.includes(RUNNER) || /(?:^|\s)npm ci(?:\s|$)/mu.test(value.run)
  )) commands.push(value.run);
  for (const child of Object.values(value)) installCommands(child, commands);
  return commands;
}

describe('hosted npm ci workflow contract', () => {
  it('routes every workflow dependency install through the repository runner', () => {
    const commands = workflowPaths.flatMap((file) => installCommands(parse(fs.readFileSync(file, 'utf8'))));
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((command) => command.includes(RUNNER))).toBe(true);
  });

  it('keeps baseline installs script-free before the explicit Electron installer', () => {
    for (const [name, jobName] of [
      ['release-macos.yml', 'release-macos'],
      ['release-windows.yml', 'release-windows']
    ]) {
      const workflow = parse(fs.readFileSync(path.join(WORKFLOW_ROOT, name), 'utf8'));
      const command = workflow.jobs[jobName].steps.find(
        (step) => step.name === 'Install verified baseline updater dependencies'
      ).run;
      const runner = command.indexOf(`${RUNNER}" --ignore-scripts`);
      expect(runner).toBeGreaterThan(-1);
      expect(runner).toBeLessThan(command.indexOf('node node_modules/electron/install.js'));
    }
  });

  it('installs the Electron runtime in each current release package job', () => {
    for (const [name, jobName] of [
      ['release-macos.yml', 'release-macos'],
      ['release-windows.yml', 'release-windows']
    ]) {
      const workflow = parse(fs.readFileSync(path.join(WORKFLOW_ROOT, name), 'utf8'));
      const steps = workflow.jobs[jobName].steps;
      const dependencies = steps.findIndex((step) => step.name === 'Install dependencies');
      const runtime = steps.findIndex((step) => step.name === 'Install Electron runtime');
      const build = steps.findIndex((step) => step.name.startsWith('Build'));
      expect(steps[runtime].run).toBe('node node_modules/electron/install.js');
      expect(dependencies).toBeLessThan(runtime);
      expect(runtime).toBeLessThan(build);
    }
  });
});
