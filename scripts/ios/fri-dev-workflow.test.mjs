// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  buildFriDevWorkflowCommands,
  FRI_DEV_APP_ID,
  FRI_DEV_BUNDLE_SUFFIX,
  FRI_DEV_TEST,
  FRI_XCUITEST_RUNNER,
  runFriDevWorkflow
} from './fri-dev-workflow.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Fri development workflow', () => {
  it('builds, syncs, operates, and reopens the current workspace on Fri', () => {
    const commands = buildFriDevWorkflowCommands({
      evidenceRoot: '/evidence', repoRoot: '/repo'
    });

    expect(commands.map(({ command, stage }) => [command, stage])).toEqual([
      ['npm', 'companion-build'],
      ['npx', 'capacitor-ios-sync'],
      ['bash', 'fri-dev-xcuitest']
    ]);
    expect(commands[0].args).toEqual(['run', 'android:web:build']);
    expect(commands[1].args).toEqual(['cap', 'sync', 'ios']);
    expect(commands[2].args).toEqual([
      FRI_XCUITEST_RUNNER,
      '--project', '/repo/ios/App/App.xcodeproj',
      '--scheme', 'AppPhysicalUITests',
      '--artifacts-dir', '/evidence/xcuitest',
      '--keep-app-foreground', FRI_DEV_APP_ID,
      '--only-testing', FRI_DEV_TEST
    ]);
    expect(commands[2].args).not.toContain('--allow-wireless');
    expect(commands[2].env.FOLIOLE_ACCEPTANCE_BUNDLE_SUFFIX).toBe(FRI_DEV_BUNDLE_SUFFIX);
  });

  it('finishes offline preparation before requiring the current unlock', async () => {
    const stages = [];
    await runFriDevWorkflow({
      evidenceRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'fri-dev-workflow-')),
      readiness: async () => { stages.push('readiness'); },
      repoRoot: '/repo',
      run: (_command, _args, options) => { stages.push(options.stage); }
    });
    expect(stages).toEqual([
      'companion-build', 'capacitor-ios-sync', 'readiness', 'fri-dev-xcuitest'
    ]);
  });

  it('uses an isolated persistent app and never prepares or removes source or apps', () => {
    const source = read('scripts/ios/fri-dev-workflow.mjs');

    expect(FRI_DEV_APP_ID).toBe('com.foliole.ios.devworkflow');
    expect(FRI_DEV_BUNDLE_SUFFIX).toBe('.devworkflow');
    expect(source).not.toMatch(/fetch|pull|reset|receipt|candidate/iu);
    expect(source).not.toMatch(/uninstall|ordinaryjourney/iu);
  });

  it('registers only the development operation test in the physical UI target', () => {
    const project = read('ios/App/App.xcodeproj/project.pbxproj');
    const sourceName = 'FoliolePhysicalDevWorkflowUITests.swift in Sources';
    const appSources = project.match(/504EC3001FED79650016851F \/\* Sources \*\/ = \{[\s\S]*?\n\t\t\};/)?.[0];
    const physicalSources = project.match(/50F100051FED79650016851F \/\* Sources \*\/ = \{[\s\S]*?\n\t\t\};/)?.[0];

    expect(appSources).not.toContain(sourceName);
    expect(physicalSources).toContain(sourceName);
    expect(read('ios/App/AppPhysicalUITests/FoliolePhysicalDevWorkflowUITests.swift'))
      .toContain('Fri-dev-workflow-operated');
  });
});
